/**
 * MongoDB aggregation pipeline that collapses every player's per-match docs
 * into a single per-player record.
 *
 * Why this exists:
 *   The csc-archetypes client used to paginate every raw match doc and
 *   aggregate them in the browser. With ~7k docs at ~5 KB each that's a
 *   ~35 MB payload, and the upstream `find().limit(500)` query takes ~23 s
 *   per page on the current Atlas tier. Doing the aggregation server-side
 *   collapses ~7k docs into ~1k player records (one per `steam_id`) in a
 *   single round trip — dramatically reducing both data transferred and
 *   client work.
 *
 * Aggregation rules mirror the legacy client-side `aggregate()` in
 * /home/admin/WebstormProjects/csc-archetypes/src/fetchData.ts:
 *
 *   * `games`             — count of matches the player appeared in.
 *   * `name` / `team_name` — taken from the player's most recent doc
 *                           (sorted by `createdAt` ascending → `$last`).
 *   * `multi_kills.{1k..5k}` — summed across docs.
 *   * SUM_FIELDS          — straight $sum (counters / cumulative totals).
 *   * RATE_FIELDS         — weighted average by `rounds_played`. Each
 *                           rate stat is multiplied by its doc's
 *                           `rounds_played` and summed; the final
 *                           projection divides by total rounds_played.
 */

import { PipelineStage } from 'mongoose';

// ---------------------------------------------------------------------------
// Field lists
// ---------------------------------------------------------------------------

/**
 * Counters / cumulative event totals — straight $sum across docs.
 *
 * Keep in sync with `SUM_FIELDS` in csc-archetypes/src/fetchData.ts.
 */
const SUM_FIELDS = [
  'rounds_played',
  'rounds_won',
  'rounds_lost',
  'kills',
  'assists',
  'deaths',
  'damage',
  'headshots',
  'opening_kills',
  'opening_deaths',
  'opening_attempts',
  'opening_successes',
  'rounds_won_after_opening',
  'perfect_kills',
  'trade_denials',
  'trade_kills',
  'traded_deaths',
  'fast_trades',
  'clutch_rounds',
  'clutch_wins',
  'clutch_1v1_attempts',
  'clutch_1v1_wins',
  'clutch_1v2_attempts',
  'clutch_1v2_wins',
  'clutch_1v3_attempts',
  'clutch_1v3_wins',
  'clutch_1v4_attempts',
  'clutch_1v4_wins',
  'clutch_1v5_attempts',
  'clutch_1v5_wins',
  'awp_kills',
  'awp_deaths',
  'awp_deaths_no_kill',
  'rounds_with_awp_kill',
  'awp_multi_kill_rounds',
  'awp_opening_kills',
  'saved_by_teammate',
  'saved_teammate',
  'opening_deaths_traded',
  'support_rounds',
  'assisted_kills',
  'attack_rounds',
  'last_alive_rounds',
  'saves_on_loss',
  'utility_damage',
  'utility_kills',
  'flashes_thrown',
  'flash_assists',
  'team_flash_count',
  'exit_frags',
  'knife_kills',
  'pistol_vs_rifle_kills',
  'early_deaths',
  'low_buy_kills',
  'disadvantaged_buy_kills',
  'man_advantage_kills',
  'man_disadvantage_deaths',
  'pistol_rounds_played',
  'pistol_round_kills',
  'pistol_round_deaths',
  'pistol_round_damage',
  'pistol_rounds_won',
  'pistol_round_survivals',
  'pistol_round_multi_kills',
  't_rounds_played',
  't_kills',
  't_deaths',
  't_damage',
  't_survivals',
  't_rounds_with_multi_kill',
  't_kast',
  't_clutch_rounds',
  't_clutch_wins',
  't_man_advantage_kills',
  't_man_disadvantage_deaths',
  't_opening_kills',
  't_opening_deaths',
  'ct_rounds_played',
  'ct_kills',
  'ct_deaths',
  'ct_damage',
  'ct_survivals',
  'ct_rounds_with_multi_kill',
  'ct_kast',
  'ct_clutch_rounds',
  'ct_clutch_wins',
  'ct_man_advantage_kills',
  'ct_man_disadvantage_deaths',
  'ct_opening_kills',
  'ct_opening_deaths',
  'rounds_with_kill',
  'rounds_with_multi_kill',
  'kills_in_won_rounds',
  'damage_in_won_rounds',
  'smokes_thrown',
  'hes_thrown',
  'molotovs_thrown',
  'total_nades_thrown',
  'he_damage',
  'fire_damage',
  'damage_taken',
  'enemies_flashed',
  'eco_kill_value',
  'eco_death_value',
  'duel_swing',
  'econ_impact',
  'round_impact',
  'probability_swing',
  't_eco_kill_value',
  'ct_eco_kill_value',
] as const;

/**
 * Rates / percentages / ratings — weighted average by `rounds_played`.
 *
 * Keep in sync with `RATE_FIELDS` in csc-archetypes/src/fetchData.ts.
 */
const RATE_FIELDS = [
  'adr',
  'kpr',
  'dpr',
  'kast',
  'survival',
  'headshot_pct',
  'avg_time_to_kill',
  'avg_time_to_death',
  'damage_per_kill',
  'time_alive_per_round',
  'damage_per_round_win',
  'kills_per_round_win',
  'rounds_with_kill_pct',
  'rounds_with_multi_kill_pct',
  'last_alive_pct',
  'saves_per_round_loss',
  'opening_kills_per_round',
  'opening_deaths_per_round',
  'opening_attempts_pct',
  'opening_success_pct',
  'win_pct_after_opening_kill',
  'clutch_points_per_round',
  'clutch_1v1_win_pct',
  'trade_kills_per_round',
  'trade_kills_pct',
  'traded_deaths_per_round',
  'traded_deaths_pct',
  'saved_by_teammate_per_round',
  'saved_teammate_per_round',
  'opening_deaths_traded_pct',
  'assisted_kills_pct',
  'assists_per_round',
  'support_rounds_pct',
  'man_advantage_kills_pct',
  'man_disadvantage_deaths_pct',
  'low_buy_kills_pct',
  'disadvantaged_buy_kills_pct',
  'attacks_per_round',
  'awp_kills_per_round',
  'awp_kills_pct',
  'rounds_with_awp_kill_pct',
  'awp_multi_kill_rounds_per_round',
  'awp_opening_kills_per_round',
  'utility_damage_per_round',
  'utility_kills_per_100_rounds',
  'flashes_thrown_per_round',
  'flash_assists_per_round',
  'enemy_flash_duration_per_round',
  'team_flash_duration_per_round',
  'pistol_round_rating',
  'hltv_rating',
  'final_rating',
  't_rating',
  't_eco_rating',
  'ct_rating',
  'ct_eco_rating',
  'duel_swing_per_round',
  'probability_swing_per_round',
] as const;

const MULTI_KILL_KEYS = ['1k', '2k', '3k', '4k', '5k'] as const;

// ---------------------------------------------------------------------------
// Pipeline builder
// ---------------------------------------------------------------------------

/**
 * Build the aggregation pipeline. Optionally filtered by an explicit list of
 * `steam_id` values (used by callers that want a subset; defaults to "all
 * players" when omitted).
 */
export function buildPlayerAggregationPipeline(steamIds?: string[]): PipelineStage[] {
  const groupStage: Record<string, unknown> = {
    _id: '$steam_id',
    games: { $sum: 1 },
    // Latest doc's name / team_name. `$last` requires the upstream sort.
    name: { $last: '$name' },
    team_name: { $last: '$team_name' },
  };

  // SUM_FIELDS: $sum of each field (with $ifNull guard for older docs that
  // may be missing a column).
  for (const field of SUM_FIELDS) {
    groupStage[field] = { $sum: { $ifNull: [`$${field}`, 0] } };
  }

  // multi_kills sub-doc: sum each bucket. Stored in temporary mk_* slots so
  // we can reassemble them as a nested object during $project.
  for (const mk of MULTI_KILL_KEYS) {
    groupStage[`mk_${mk}`] = { $sum: { $ifNull: [`$multi_kills.${mk}`, 0] } };
  }

  // RATE_FIELDS: accumulate sum(field * rounds_played) so we can divide by
  // total rounds_played in the projection. Stored in temporary _w slots.
  for (const field of RATE_FIELDS) {
    groupStage[`${field}_w`] = {
      $sum: {
        $multiply: [
          { $ifNull: [`$${field}`, 0] },
          { $ifNull: ['$rounds_played', 0] },
        ],
      },
    };
  }

  // Final $project: rename `_id` → `steam_id`, expose every sum directly,
  // reassemble multi_kills, and divide each weighted accumulator by total
  // rounds_played to get the weighted average. Guard against /0 with $cond.
  const projectStage: Record<string, unknown> = {
    _id: 0,
    steam_id: '$_id',
    games: 1,
    name: 1,
    team_name: 1,
  };
  for (const field of SUM_FIELDS) {
    projectStage[field] = 1;
  }
  projectStage.multi_kills = {
    '1k': '$mk_1k',
    '2k': '$mk_2k',
    '3k': '$mk_3k',
    '4k': '$mk_4k',
    '5k': '$mk_5k',
  };
  for (const field of RATE_FIELDS) {
    projectStage[field] = {
      $cond: [
        { $gt: ['$rounds_played', 0] },
        { $divide: [`$${field}_w`, '$rounds_played'] },
        0,
      ],
    };
  }

  const pipeline: PipelineStage[] = [];

  if (steamIds && steamIds.length > 0) {
    pipeline.push({ $match: { steam_id: { $in: steamIds } } });
  }

  // Sort by createdAt so $last picks the player's latest doc deterministically.
  pipeline.push({ $sort: { createdAt: 1 } });
  // groupStage / projectStage are constructed dynamically; we know they have
  // the right shape (groupStage has `_id`, projectStage has `_id: 0`), but TS
  // can't infer that through the loop-and-assign pattern.
  pipeline.push({ $group: groupStage } as PipelineStage.Group);
  pipeline.push({ $project: projectStage } as PipelineStage.Project);

  return pipeline;
}

export { SUM_FIELDS, RATE_FIELDS, MULTI_KILL_KEYS };
