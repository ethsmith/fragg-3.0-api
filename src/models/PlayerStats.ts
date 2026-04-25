/**
 * PlayerStats model.
 *
 * Mirrors the JSON-serialized `PlayerStats` struct produced by the Go demo
 * parser at /home/admin/Documents/code/GolandProjects/ecorating/model/player_stats.go.
 *
 * Field names use snake_case to match the parser output 1:1, so a parsed
 * record can be persisted directly:
 *
 *   await PlayerStatsModel.insertMany(parserResults);
 *
 * Fields tagged `json:"-"` in the Go struct (internal aggregation buffers,
 * raw multi-kill arrays, debug breakdowns) are intentionally omitted.
 */

import { Schema, model, InferSchemaType, Model } from 'mongoose';

// -----------------------------------------------------------------------------
// MultiKillStats sub-schema
// -----------------------------------------------------------------------------

const multiKillStatsSchema = new Schema(
  {
    '1k': { type: Number, default: 0 },
    '2k': { type: Number, default: 0 },
    '3k': { type: Number, default: 0 },
    '4k': { type: Number, default: 0 },
    '5k': { type: Number, default: 0 },
  },
  { _id: false },
);

// -----------------------------------------------------------------------------
// PlayerStats schema
// -----------------------------------------------------------------------------

const num = { type: Number, default: 0 };

const playerStatsSchema = new Schema(
  {
    // --- Identity ---------------------------------------------------------
    match_id: { type: String, required: true, index: true },
    steam_id: { type: String, required: true, index: true },
    name: { type: String, default: '' },
    team_name: { type: String, default: '' },

    // --- Basic per-game counters -----------------------------------------
    rounds_played: num,
    rounds_won: num,
    rounds_lost: num,
    kills: num,
    assists: num,
    deaths: num,
    damage: num,
    opening_kills: num,
    adr: num,
    kpr: num,
    dpr: num,
    headshots: num,
    headshot_pct: num,
    avg_time_to_kill: num,
    perfect_kills: num,
    trade_denials: num,
    traded_deaths: num,
    rounds_with_kill: num,
    rounds_with_multi_kill: num,
    kills_in_won_rounds: num,
    damage_in_won_rounds: num,
    awp_kills: num,
    awp_kills_per_round: num,
    rounds_with_awp_kill: num,
    awp_multi_kill_rounds: num,
    awp_opening_kills: num,

    // --- Multi-kill buckets ----------------------------------------------
    multi_kills: { type: multiKillStatsSchema, default: () => ({}) },

    // --- Impact / KAST / economy / clutch / trade / opening / etc. -------
    round_impact: num,
    survival: num,
    kast: num,
    econ_impact: num,
    eco_kill_value: num,
    eco_death_value: num,
    duel_swing: num,
    duel_swing_per_round: num,
    clutch_rounds: num,
    clutch_wins: num,
    saved_by_teammate: num,
    saved_teammate: num,
    opening_deaths: num,
    opening_deaths_traded: num,
    support_rounds: num,
    assisted_kills: num,
    trade_kills: num,
    fast_trades: num,
    man_advantage_kills: num,
    man_advantage_kills_pct: num,
    man_disadvantage_deaths: num,
    man_disadvantage_deaths_pct: num,
    opening_attempts: num,
    opening_successes: num,
    rounds_won_after_opening: num,
    attack_rounds: num,
    clutch_1v1_attempts: num,
    clutch_1v1_wins: num,
    time_alive_per_round: num,
    last_alive_rounds: num,
    saves_on_loss: num,
    utility_damage: num,
    utility_kills: num,
    flashes_thrown: num,
    flash_assists: num,
    enemy_flash_duration_per_round: num,
    team_flash_count: num,
    team_flash_duration_per_round: num,
    exit_frags: num,
    awp_deaths: num,
    awp_deaths_no_kill: num,
    knife_kills: num,
    pistol_vs_rifle_kills: num,
    early_deaths: num,
    low_buy_kills: num,
    low_buy_kills_pct: num,
    disadvantaged_buy_kills: num,
    disadvantaged_buy_kills_pct: num,

    // --- Pistol rounds ----------------------------------------------------
    pistol_rounds_played: num,
    pistol_round_kills: num,
    pistol_round_deaths: num,
    pistol_round_damage: num,
    pistol_rounds_won: num,
    pistol_round_survivals: num,
    pistol_round_multi_kills: num,
    pistol_round_rating: num,

    // --- Aggregate rating -------------------------------------------------
    hltv_rating: num,

    // --- T side -----------------------------------------------------------
    t_rounds_played: num,
    t_kills: num,
    t_deaths: num,
    t_damage: num,
    t_survivals: num,
    t_rounds_with_multi_kill: num,
    t_eco_kill_value: num,
    t_probability_swing: num,
    t_kast: num,
    t_clutch_rounds: num,
    t_clutch_wins: num,
    t_man_advantage_kills: num,
    t_man_advantage_kills_pct: num,
    t_man_disadvantage_deaths: num,
    t_man_disadvantage_deaths_pct: num,
    t_rating: num,
    t_eco_rating: num,

    // --- CT side ----------------------------------------------------------
    ct_rounds_played: num,
    ct_kills: num,
    ct_deaths: num,
    ct_damage: num,
    ct_survivals: num,
    ct_rounds_with_multi_kill: num,
    ct_eco_kill_value: num,
    ct_probability_swing: num,
    ct_kast: num,
    ct_clutch_rounds: num,
    ct_clutch_wins: num,
    ct_man_advantage_kills: num,
    ct_man_advantage_kills_pct: num,
    ct_man_disadvantage_deaths: num,
    ct_man_disadvantage_deaths_pct: num,
    ct_rating: num,
    ct_eco_rating: num,

    // --- Final rating -----------------------------------------------------
    final_rating: num,

    // --- Clutch 1vN breakdown --------------------------------------------
    clutch_1v2_attempts: num,
    clutch_1v2_wins: num,
    clutch_1v3_attempts: num,
    clutch_1v3_wins: num,
    clutch_1v4_attempts: num,
    clutch_1v4_wins: num,
    clutch_1v5_attempts: num,
    clutch_1v5_wins: num,

    // --- Utility throw counts --------------------------------------------
    smokes_thrown: num,
    hes_thrown: num,
    molotovs_thrown: num,
    total_nades_thrown: num,
    he_damage: num,
    fire_damage: num,

    // --- Damage extras ----------------------------------------------------
    damage_taken: num,
    damage_per_round: num,

    // --- Avg time to death -----------------------------------------------
    avg_time_to_death: num,

    // --- Side-specific opening duels -------------------------------------
    t_opening_kills: num,
    t_opening_deaths: num,
    ct_opening_kills: num,
    ct_opening_deaths: num,

    // --- Round win shares -------------------------------------------------
    round_win_shares: num,

    // --- Enemies flashed --------------------------------------------------
    enemies_flashed: num,

    // --- Derived per-round / percentage metrics --------------------------
    rounds_with_kill_pct: num,
    kills_per_round_win: num,
    rounds_with_multi_kill_pct: num,
    damage_per_round_win: num,
    saved_by_teammate_per_round: num,
    traded_deaths_per_round: num,
    traded_deaths_pct: num,
    opening_deaths_traded_pct: num,
    assists_per_round: num,
    support_rounds_pct: num,
    saved_teammate_per_round: num,
    trade_kills_per_round: num,
    trade_kills_pct: num,
    assisted_kills_pct: num,
    damage_per_kill: num,
    opening_kills_per_round: num,
    opening_deaths_per_round: num,
    opening_attempts_pct: num,
    opening_success_pct: num,
    win_pct_after_opening_kill: num,
    attacks_per_round: num,
    clutch_points_per_round: num,
    last_alive_pct: num,
    clutch_1v1_win_pct: num,
    saves_per_round_loss: num,
    awp_kills_pct: num,
    rounds_with_awp_kill_pct: num,
    awp_multi_kill_rounds_per_round: num,
    awp_opening_kills_per_round: num,
    utility_damage_per_round: num,
    utility_kills_per_100_rounds: num,
    flashes_thrown_per_round: num,
    flash_assists_per_round: num,

    // --- Probability-based swing metrics (v3.0) --------------------------
    probability_swing: num,
    probability_swing_per_round: num,
    eco_adjusted_kills: num,
    swing_rating: num,
  },
  {
    timestamps: true,
    collection: 'player_stats',
  },
);

// One document per (match, player). Prevents accidental duplicate inserts
// when re-parsing the same demo.
playerStatsSchema.index({ match_id: 1, steam_id: 1 }, { unique: true });

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type MultiKillStats = InferSchemaType<typeof multiKillStatsSchema>;
export type PlayerStats = InferSchemaType<typeof playerStatsSchema>;

// -----------------------------------------------------------------------------
// Model (guarded so re-imports under hot-reload / serverless don't re-register)
// -----------------------------------------------------------------------------

import mongoose from 'mongoose';

export const PlayerStatsModel: Model<PlayerStats> =
  (mongoose.models.PlayerStats as Model<PlayerStats> | undefined) ??
  model<PlayerStats>('PlayerStats', playerStatsSchema);

export { playerStatsSchema, multiKillStatsSchema };
