/**
 * Match model: one document per parsed map.
 *
 * A document is the eco-rating engine's payload for one demo, stored as-is
 * (schemaVersion, engineVersion, outcome, mapName, teams, players, rounds,
 * ...), plus the worker's metadata:
 *
 *   matchId      the worker's key: "<csc match id>-m<N>" for regulation, playoff and
 *                combine maps, the server/timestamp ID for preseason and scrims
 *   type         regulation | playoff | combine | preseason | scrim
 *   season       CSC season number
 *   demo         .dem filename inside the archive
 *   demoUrl      archive URL the demo came from
 *   completedAt  when CSC says the match finished, when known
 *   ingestedAt   when this version of the document was written
 *
 * (matchId, type) is unique: a PUT replaces the whole document.
 *
 * `players` holds each player's whole-match row (side 4) and T/CT side rows
 * (2, 3). `rounds[].players` holds the per-round rows. A score-only map
 * (fullStatsOK false) has teams and score only.
 *
 * The schema is not strict, so fields a newer engine adds are kept without
 * a change here. The payload's own fields are documented in eco-rating's
 * engine/payload/fields.tsv.
 */

import { Schema, model, Model } from 'mongoose';

export const MATCH_TYPES = ['regulation', 'playoff', 'combine', 'preseason', 'scrim'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export function isMatchType(v: unknown): v is MatchType {
  return typeof v === 'string' && (MATCH_TYPES as readonly string[]).includes(v);
}

/** Side values on player rows. */
export const SIDE = { t: 2, ct: 3, all: 4 } as const;
export type SideName = keyof typeof SIDE;

export interface MatchDoc {
  matchId: string;
  type: MatchType;
  season: number;
  demo?: string;
  demoUrl?: string;
  completedAt?: Date | null;
  ingestedAt: Date;
  schemaVersion: number;
  engineVersion: string;
  fullStatsOK: boolean;
  outcome: string;
  reason: string;
  detail: string;
  mapName: string;
  tickRate: number;
  totalRounds: number;
  headerMatchID: string | null;
  teams: Array<Record<string, unknown> & { name: string; score: number }>;
  players?: Array<Record<string, unknown>>;
  rounds?: Array<Record<string, unknown>>;
}

const matchSchema = new Schema<MatchDoc>(
  {
    matchId: { type: String, required: true },
    type: { type: String, enum: MATCH_TYPES, required: true },
    season: { type: Number, required: true },
    demo: String,
    demoUrl: String,
    completedAt: Date,
    ingestedAt: { type: Date, required: true },
    schemaVersion: Number,
    engineVersion: String,
    fullStatsOK: Boolean,
    outcome: String,
    reason: String,
    detail: String,
    mapName: String,
    tickRate: Number,
    totalRounds: Number,
    headerMatchID: String,
    teams: [Schema.Types.Mixed],
    players: [Schema.Types.Mixed],
    rounds: [Schema.Types.Mixed],
  },
  {
    collection: 'matches',
    strict: false,
    versionKey: false,
  },
);

matchSchema.index({ matchId: 1, type: 1 }, { unique: true });
matchSchema.index({ season: 1, type: 1, completedAt: -1 });
matchSchema.index({ 'players.steamID': 1, season: 1, type: 1 });
matchSchema.index({ 'teams.name': 1, season: 1, type: 1 });

export const MatchModel: Model<MatchDoc> = model<MatchDoc>('Match', matchSchema);
