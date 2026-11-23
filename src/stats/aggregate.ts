/**
 * Aggregation pipelines over the `matches` collection.
 *
 * Player rows are folded across maps with one rule per field:
 *
 *   * int fields (counters)               summed
 *   * float totals (FLOAT_TOTALS)         summed
 *   * every other float (rates, ratings)  averaged, weighted by the field's
 *                                         denominator (WEIGHTS, default `rounds`)
 *   * round-state fields (EXCLUDED)       dropped: they only mean something
 *                                         on a single round row
 *
 * The field list itself comes from eco-rating (src/stats/fields.ts, generated
 * by scripts/gen-fields.mjs), so a new engine field is aggregated by these
 * rules without touching this file. Add it to FLOAT_TOTALS or WEIGHTS only
 * when the default (round-weighted average) is wrong for it.
 */

import { PipelineStage } from 'mongoose';
import { PLAYER_FIELDS, TEAM_FIELDS } from './fields';
import { MatchType, SIDE, SideName } from '../models/Match';

/** Round-state fields with no meaning across rounds or maps. */
const EXCLUDED = new Set([
  'side',
  'teamENUM',
  'health',
  'deathTick',
  'ctAWP',
  'lurkerBlips',
  'mostRecentFlashVal',
]);

/** Floats that are totals, not rates: summed like counters. */
const FLOAT_TOTALS = new Set([
  'kastRounds',
  'TKASTRounds',
  'ctKASTRounds',
  'enemyFlashTime',
  'teamFlashTime',
  'killPoints',
  'impactPoints',
  'winPoints',
  'mip',
  'TImpactPoints',
  'ctImpactPoints',
  'TWinPoints',
  'ctWinPoints',
  'teamsWinPoints',
  'TTeamsWinPoints',
  'ctTeamsWinPoints',
  'ecoKillValue',
  'ecoDeathValue',
  'ecoProbabilitySwing',
  'ecoDuelSwing',
  'ecoTProbabilitySwing',
  'ecoCTProbabilitySwing',
  'ecoAdjustedKills',
]);

/**
 * Denominators for averaged floats that are not per-round. The T and CT
 * columns of the whole-match row are per side-round; on side rows the plain
 * `rounds` already is the side's rounds, so these apply to side 4 only.
 */
const WHOLE_ROW_WEIGHTS: Record<string, string> = {
  TKAST: 'TRounds',
  TADR: 'TRounds',
  TADP: 'TRounds',
  TRating: 'TRounds',
  TImpactRating: 'TRounds',
  hltvTRating: 'TRounds',
  ecoTEcoRating: 'TRounds',
  ctKAST: 'ctRounds',
  ctADR: 'ctRounds',
  ctADP: 'ctRounds',
  ctRating: 'ctRounds',
  ctImpactRating: 'ctRounds',
  hltvCtRating: 'ctRounds',
  ecoCTEcoRating: 'ctRounds',
  pistolRoundRating: 'pistolRounds',
  ecoBuyRating: 'ecoBuyRounds',
  forceBuyRating: 'forceBuyRounds',
  fullBuyRating: 'fullBuyRounds',
  antiEcoRating: 'antiEcoRounds',
};

/**
 * Season ratings CSC-Stats blends: 75% round-weighted average + 25% plain
 * per-map average, so a short map counts for a little more than its rounds.
 * Kept identical so season ratings match CSC's own.
 */
const BLENDED = new Set(['rating', 'swing_rating']);

const ANY_ROW_WEIGHTS: Record<string, string> = {
  avgTimeToKill: 'kills',
  avgTimeToDeath: 'deaths',
};

type Rule = { kind: 'sum' } | { kind: 'avg'; weight: string };

function playerRules(side: SideName): Map<string, Rule> {
  const rules = new Map<string, Rule>();
  for (const [field, kind] of Object.entries(PLAYER_FIELDS)) {
    if (EXCLUDED.has(field)) continue;
    if (kind === 'int' || FLOAT_TOTALS.has(field)) {
      rules.set(field, { kind: 'sum' });
      continue;
    }
    const weight =
      ANY_ROW_WEIGHTS[field] ?? (side === 'all' ? WHOLE_ROW_WEIGHTS[field] : undefined) ?? 'rounds';
    rules.set(field, { kind: 'avg', weight });
  }
  return rules;
}

/** Numeric player fields a caller may sort or project on. */
export function playerFieldNames(): string[] {
  return [...playerRules('all').keys(), 'maps', 'mapsWon'];
}

export interface PlayerQuery {
  season?: number;
  type?: MatchType;
  side: SideName;
  steamIds?: string[];
  minRounds?: number;
  sort?: string;
  order?: 1 | -1;
  limit?: number;
  skip?: number;
  fields?: string[];
}

function matchFilter(season?: number, type?: MatchType): Record<string, unknown> {
  const f: Record<string, unknown> = { fullStatsOK: true };
  if (season != null) f.season = season;
  if (type != null) f.type = type;
  return f;
}

/** $addFields stage computing the map winner's name (null on a tie). */
const winnerStage: PipelineStage = {
  $addFields: {
    _winner: {
      $let: {
        vars: {
          a: { $arrayElemAt: ['$teams', 0] },
          b: { $arrayElemAt: ['$teams', 1] },
        },
        in: {
          $switch: {
            branches: [
              { case: { $gt: ['$$a.score', '$$b.score'] }, then: '$$a.name' },
              { case: { $lt: ['$$a.score', '$$b.score'] }, then: '$$b.name' },
            ],
            default: null,
          },
        },
      },
    },
  },
};

/**
 * One aggregated record per player: every numeric field folded by its rule,
 * plus `maps` (maps played), `mapsWon`, and the latest `name` / `teamClanName`.
 */
export function playerPipeline(q: PlayerQuery): PipelineStage[] {
  const rules = playerRules(q.side);
  const sideNum = SIDE[q.side];

  const first: Record<string, unknown> = matchFilter(q.season, q.type);
  if (q.steamIds?.length) first['players.steamID'] = { $in: q.steamIds };

  const rowMatch: Record<string, unknown> = {
    'p.side': sideNum,
    'p.isBot': { $ne: true },
    'p.steamID': { $nin: ['0', '', null] },
  };
  if (q.steamIds?.length) rowMatch['p.steamID'] = { $in: q.steamIds };

  const group: Record<string, unknown> = {
    _id: '$p.steamID',
    name: { $last: '$p.name' },
    teamClanName: { $last: '$p.teamClanName' },
    maps: { $sum: 1 },
    mapsWon: {
      $sum: { $cond: [{ $and: [{ $ne: ['$_winner', null] }, { $eq: ['$_winner', '$p.teamClanName'] }] }, 1, 0] },
    },
  };
  const project: Record<string, unknown> = {
    _id: 0,
    steamID: '$_id',
    name: 1,
    teamClanName: 1,
    maps: 1,
    mapsWon: 1,
  };

  for (const [field, rule] of rules) {
    const v = { $ifNull: [`$p.${field}`, 0] };
    if (rule.kind === 'sum') {
      group[field] = { $sum: v };
      project[field] = 1;
    } else {
      // Sum value*weight here; divide by the weight's total in $project.
      group[`_w_${field}`] = { $sum: { $multiply: [v, { $ifNull: [`$p.${rule.weight}`, 0] }] } };
      const weighted = {
        $cond: [{ $gt: [`$${rule.weight}`, 0] }, { $divide: [`$_w_${field}`, `$${rule.weight}`] }, 0],
      };
      if (BLENDED.has(field)) {
        group[`_flat_${field}`] = { $avg: v };
        project[field] = { $add: [{ $multiply: [weighted, 0.75] }, { $multiply: [`$_flat_${field}`, 0.25] }] };
      } else {
        project[field] = weighted;
      }
    }
  }
  // Weights must be in the group even if a caller's `fields` drops them.
  for (const rule of rules.values()) {
    if (rule.kind === 'avg' && !(rule.weight in group)) {
      group[rule.weight] = { $sum: { $ifNull: [`$p.${rule.weight}`, 0] } };
    }
  }

  const stages: PipelineStage[] = [
    { $match: first },
    winnerStage,
    { $project: { _winner: 1, completedAt: 1, ingestedAt: 1, p: '$players' } },
    { $unwind: '$p' },
    { $match: rowMatch },
    { $sort: { completedAt: 1, ingestedAt: 1 } },
    { $group: group } as PipelineStage,
    { $project: project } as PipelineStage,
  ];
  if (q.minRounds) stages.push({ $match: { rounds: { $gte: q.minRounds } } });
  stages.push({ $sort: { [q.sort ?? 'rating']: q.order ?? -1, steamID: 1 } });
  if (q.skip) stages.push({ $skip: q.skip });
  if (q.limit) stages.push({ $limit: q.limit });
  if (q.fields?.length) {
    const keep: Record<string, 1> = { steamID: 1, name: 1, teamClanName: 1 };
    for (const f of q.fields) keep[f] = 1;
    stages.push({ $project: keep });
  }
  return stages;
}

export interface TeamQuery {
  season?: number;
  type?: MatchType;
  names?: string[];
}

/**
 * One aggregated record per team name: maps, mapsWon, roundsWon, roundsLost,
 * and every numeric team-row field summed (they are all counters or totals).
 */
export function teamPipeline(q: TeamQuery): PipelineStage[] {
  const first: Record<string, unknown> = matchFilter(q.season, q.type);
  if (q.names?.length) first['teams.name'] = { $in: q.names };

  const group: Record<string, unknown> = {
    _id: '$t.name',
    maps: { $sum: 1 },
    mapsWon: { $sum: { $cond: [{ $eq: ['$_winner', '$t.name'] }, 1, 0] } },
    mapsTied: { $sum: { $cond: [{ $eq: ['$_winner', null] }, 1, 0] } },
    roundsWon: { $sum: '$t.score' },
    roundsLost: { $sum: { $subtract: [{ $sum: '$teams.score' }, '$t.score'] } },
  };
  const project: Record<string, unknown> = { _id: 0, name: '$_id', maps: 1, mapsWon: 1, mapsTied: 1, roundsWon: 1, roundsLost: 1 };
  for (const field of Object.keys(TEAM_FIELDS)) {
    if (field === 'score') continue;
    group[field] = { $sum: { $ifNull: [`$t.${field}`, 0] } };
    project[field] = 1;
  }

  const stages: PipelineStage[] = [
    { $match: first },
    winnerStage,
    { $project: { _winner: 1, teams: 1, t: '$teams' } },
    { $unwind: '$t' },
  ];
  if (q.names?.length) stages.push({ $match: { 't.name': { $in: q.names } } });
  stages.push({ $group: group } as PipelineStage, { $project: project } as PipelineStage, {
    $sort: { mapsWon: -1, name: 1 },
  });
  return stages;
}

/** Fields of a match summary: everything but the player and round rows. */
export const MATCH_SUMMARY_PROJECTION = {
  _id: 0,
  players: 0,
  rounds: 0,
} as const;
