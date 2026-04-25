/**
 * /player-stats routes.
 *
 * Endpoints:
 *
 *   POST   /player-stats                              ingest one doc or array (match_id from body)
 *   POST   /player-stats/match/:matchId               ingest one doc or array (match_id from URL)
 *   GET    /player-stats                              list, filter via ?match_id=&steam_id=, paginate via ?limit=&skip=
 *   GET    /player-stats/match/:matchId               all players for a match
 *   GET    /player-stats/player/:steamId              all matches for a player
 *   GET    /player-stats/match/:matchId/player/:steamId   single doc by composite key
 *
 * POST inserts by default; pass ?upsert=true to replace existing docs on
 * (match_id, steam_id) collision instead of returning 409. Useful when
 * re-running the parser over the same demo.
 */

import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { Error as MongooseError, FilterQuery } from 'mongoose';
import { PlayerStatsModel, PlayerStats } from '../models/PlayerStats';
import { requireApiKey } from '../middleware/requireApiKey';

const router = Router();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}

function parseNonNegInt(value: unknown, fallback: number, max?: number): number {
  if (typeof value !== 'string') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return max != null ? Math.min(n, max) : n;
}

async function ingest(
  rawBody: unknown,
  matchIdFromUrl: string | undefined,
  upsert: boolean,
  res: Response,
): Promise<Response> {
  if (rawBody == null || (Array.isArray(rawBody) && rawBody.length === 0)) {
    return res
      .status(400)
      .json({ error: 'Body must be a player-stats object or non-empty array' });
  }

  const incoming = Array.isArray(rawBody) ? rawBody : [rawBody];
  const docs = incoming.map((d) => {
    if (typeof d !== 'object' || d === null) {
      throw new MongooseError.ValidationError();
    }
    return matchIdFromUrl ? { ...d, match_id: matchIdFromUrl } : d;
  });

  try {
    if (upsert) {
      const ops = docs.map((d: Record<string, unknown>) => ({
        updateOne: {
          filter: {
            match_id: d.match_id,
            steam_id: d.steam_id,
          },
          update: { $set: d },
          upsert: true,
        },
      }));
      const result = await PlayerStatsModel.bulkWrite(ops, { ordered: false });
      return res.status(200).json({
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
        matched: result.matchedCount,
      });
    }

    const inserted = await PlayerStatsModel.insertMany(docs, { ordered: false });
    return res.status(201).json({
      inserted: inserted.length,
      ids: inserted.map((d) => d._id),
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({
        error:
          'One or more (match_id, steam_id) pairs already exist. ' +
          'Pass ?upsert=true to overwrite.',
      });
    }
    if (err instanceof MongooseError.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// POST /player-stats   — ingest, match_id must be present in each doc
// ---------------------------------------------------------------------------

router.post(
  '/',
  requireApiKey,
  asyncHandler(async (req, res) => {
    const upsert = req.query.upsert === 'true';
    await ingest(req.body, undefined, upsert, res);
  }),
);

// ---------------------------------------------------------------------------
// POST /player-stats/match/:matchId   — match_id supplied by URL,
// stamped onto every body doc (overrides any value in the body).
// ---------------------------------------------------------------------------

router.post(
  '/match/:matchId',
  requireApiKey,
  asyncHandler(async (req, res) => {
    const upsert = req.query.upsert === 'true';
    await ingest(req.body, req.params.matchId, upsert, res);
  }),
);

// ---------------------------------------------------------------------------
// GET /player-stats   — flexible filter
// ---------------------------------------------------------------------------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter: FilterQuery<PlayerStats> = {};
    if (typeof req.query.match_id === 'string') filter.match_id = req.query.match_id;
    if (typeof req.query.steam_id === 'string') filter.steam_id = req.query.steam_id;

    const limit = parseNonNegInt(req.query.limit, 100, 500);
    const skip = parseNonNegInt(req.query.skip, 0);

    const [docs, total] = await Promise.all([
      PlayerStatsModel.find(filter).skip(skip).limit(limit).lean(),
      PlayerStatsModel.countDocuments(filter),
    ]);

    res.json({ total, count: docs.length, skip, limit, results: docs });
  }),
);

// ---------------------------------------------------------------------------
// GET /player-stats/match/:matchId   — all players in a match
// ---------------------------------------------------------------------------

router.get(
  '/match/:matchId',
  asyncHandler(async (req, res) => {
    const docs = await PlayerStatsModel.find({ match_id: req.params.matchId }).lean();
    res.json({ match_id: req.params.matchId, count: docs.length, results: docs });
  }),
);

// ---------------------------------------------------------------------------
// GET /player-stats/player/:steamId   — all matches for a player
// ---------------------------------------------------------------------------

router.get(
  '/player/:steamId',
  asyncHandler(async (req, res) => {
    const docs = await PlayerStatsModel.find({ steam_id: req.params.steamId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ steam_id: req.params.steamId, count: docs.length, results: docs });
  }),
);

// ---------------------------------------------------------------------------
// GET /player-stats/match/:matchId/player/:steamId   — single doc
// ---------------------------------------------------------------------------

router.get(
  '/match/:matchId/player/:steamId',
  asyncHandler(async (req, res) => {
    const doc = await PlayerStatsModel.findOne({
      match_id: req.params.matchId,
      steam_id: req.params.steamId,
    }).lean();

    if (!doc) {
      return res.status(404).json({
        error: 'No player-stats document for that (match_id, steam_id)',
      });
    }
    return res.json(doc);
  }),
);

export default router;
