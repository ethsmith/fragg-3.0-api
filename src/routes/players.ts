/**
 * /players: player rows folded across maps (rules in src/stats/aggregate.ts).
 *
 *   GET /players                 one record per player
 *        ?season= &type= &side=all|t|ct (default all) &steamId= (repeatable or comma list)
 *        &minRounds= &sort=<field> (default rating) &order=asc|desc &limit= &skip=
 *        &fields=<comma list> (only these numeric fields; identity always included)
 *   GET /players/:steamId        that player's aggregate and their row from every map
 *        ?season= &type= &side=all|t|ct
 */

import { Router } from 'express';
import { MatchModel, SIDE, SideName } from '../models/Match';
import { playerFieldNames, playerPipeline } from '../stats/aggregate';
import { asyncHandler, HttpError, queryEnum, queryInt, queryList, queryType } from './util';

const router = Router();
const SIDES = Object.keys(SIDE) as SideName[];

function checkFields(fields: string[] | undefined, what: string): void {
  if (!fields) return;
  const known = new Set(playerFieldNames());
  const bad = fields.filter((f) => !known.has(f));
  if (bad.length) throw new HttpError(400, `unknown ${what}: ${bad.join(', ')}`);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const sort = typeof req.query.sort === 'string' && req.query.sort ? req.query.sort : 'rating';
    const fields = queryList(req, 'fields');
    checkFields([sort], 'sort field');
    checkFields(fields, 'fields');

    const pipeline = playerPipeline({
      season: queryInt(req, 'season', { min: 1 }),
      type: queryType(req),
      side: queryEnum(req, 'side', SIDES, 'all'),
      steamIds: queryList(req, 'steamId'),
      minRounds: queryInt(req, 'minRounds', { min: 0 }),
      sort,
      order: queryEnum(req, 'order', ['asc', 'desc'] as const, 'desc') === 'asc' ? 1 : -1,
      limit: queryInt(req, 'limit', { min: 1 }),
      skip: queryInt(req, 'skip', { min: 0 }),
      fields,
    });
    const results = await MatchModel.aggregate(pipeline, { allowDiskUse: true });
    res.json({ count: results.length, results });
  }),
);

router.get(
  '/:steamId',
  asyncHandler(async (req, res) => {
    const steamId = req.params.steamId;
    const season = queryInt(req, 'season', { min: 1 });
    const type = queryType(req);
    const side = queryEnum(req, 'side', SIDES, 'all');

    const filter: Record<string, unknown> = { 'players.steamID': steamId, fullStatsOK: true };
    if (season != null) filter.season = season;
    if (type) filter.type = type;

    const [aggregate, matches] = await Promise.all([
      MatchModel.aggregate(playerPipeline({ season, type, side, steamIds: [steamId] })),
      MatchModel.aggregate([
        { $match: filter },
        { $sort: { completedAt: -1, ingestedAt: -1 } },
        {
          $project: {
            _id: 0,
            matchId: 1,
            type: 1,
            season: 1,
            mapName: 1,
            completedAt: 1,
            totalRounds: 1,
            teams: { $map: { input: '$teams', as: 't', in: { name: '$$t.name', score: '$$t.score' } } },
            row: {
              $first: {
                $filter: {
                  input: '$players',
                  as: 'p',
                  cond: { $and: [{ $eq: ['$$p.steamID', steamId] }, { $eq: ['$$p.side', SIDE[side]] }] },
                },
              },
            },
          },
        },
      ]),
    ]);

    if (!aggregate.length && !matches.length) {
      throw new HttpError(404, `no matches for player ${steamId}`);
    }
    res.json({ steamID: steamId, side, aggregate: aggregate[0] ?? null, matches });
  }),
);

export default router;
