/**
 * /matches: one document per parsed map, keyed by (type, matchId).
 *
 *   GET    /matches                       summaries (no player/round rows), newest first
 *            ?season= &type= &steamId= &team= &map= &limit= (default 50, max 500) &skip=
 *   HEAD   /matches/:type/:matchId        200 if stored, 404 if not (uncached; the worker's skip check)
 *   GET    /matches/:type/:matchId        the whole document; ?rounds=false drops the round rows
 *   PUT    /matches/:type/:matchId        store a payload, replacing any existing one   [API key]
 *   DELETE /matches/:type/:matchId        delete it                                     [API key]
 *
 * PUT body: the eco-rating payload with `season` (required), and optionally
 * `demo`, `demoUrl` and `completedAt`. Bodies may be gzipped
 * (Content-Encoding: gzip); a full payload is large.
 */

import { Router } from 'express';
import { FilterQuery } from 'mongoose';
import { MatchDoc, MatchModel } from '../models/Match';
import { requireApiKey } from '../middleware/requireApiKey';
import { MATCH_SUMMARY_PROJECTION } from '../stats/aggregate';
import { asyncHandler, HttpError, pathType, queryInt, queryList, queryType } from './util';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter: FilterQuery<MatchDoc> = {};
    const season = queryInt(req, 'season', { min: 1 });
    const type = queryType(req);
    const steamIds = queryList(req, 'steamId');
    const teams = queryList(req, 'team');
    const maps = queryList(req, 'map');
    if (season != null) filter.season = season;
    if (type) filter.type = type;
    if (steamIds) filter['players.steamID'] = { $in: steamIds };
    if (teams) filter['teams.name'] = { $in: teams };
    if (maps) filter.mapName = { $in: maps };

    const limit = queryInt(req, 'limit', { min: 1, max: 500 }) ?? 50;
    const skip = queryInt(req, 'skip', { min: 0 }) ?? 0;

    const [results, total] = await Promise.all([
      MatchModel.find(filter, MATCH_SUMMARY_PROJECTION)
        .sort({ completedAt: -1, ingestedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MatchModel.countDocuments(filter),
    ]);
    res.json({ total, skip, limit, results });
  }),
);

router.head(
  '/:type/:matchId',
  asyncHandler(async (req, res) => {
    const type = pathType(req);
    const exists = await MatchModel.exists({ matchId: req.params.matchId, type });
    res.setHeader('Cache-Control', 'no-store');
    res.status(exists ? 200 : 404).end();
  }),
);

router.get(
  '/:type/:matchId',
  asyncHandler(async (req, res) => {
    const type = pathType(req);
    const projection: Record<string, 0> = { _id: 0 };
    if (req.query.rounds === 'false') projection.rounds = 0;
    const doc = await MatchModel.findOne({ matchId: req.params.matchId, type }, projection).lean();
    if (!doc) throw new HttpError(404, `no ${type} match ${req.params.matchId}`);
    res.json(doc);
  }),
);

router.put(
  '/:type/:matchId',
  requireApiKey,
  asyncHandler(async (req, res) => {
    const type = pathType(req);
    const matchId = req.params.matchId;
    const body = req.body as Record<string, unknown> | undefined;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'body must be a payload object');
    }
    if (!Number.isInteger(body.season) || (body.season as number) < 1) {
      throw new HttpError(400, 'season must be a positive integer');
    }
    if (typeof body.schemaVersion !== 'number' || !Array.isArray(body.teams)) {
      throw new HttpError(400, 'body is not an eco-rating payload (schemaVersion, teams)');
    }

    // completedAt only orders results, so an unparseable one is dropped
    // rather than failing the whole store.
    let completedAt: Date | null = null;
    if (body.completedAt != null && body.completedAt !== '') {
      const d = new Date(String(body.completedAt));
      if (!Number.isNaN(d.getTime())) completedAt = d;
    }

    // Stored as-is, so fields a newer engine adds survive without a schema change.
    const doc = { ...body, matchId, type, completedAt, ingestedAt: new Date() };
    delete (doc as Record<string, unknown>)._id;

    const result = await MatchModel.collection.replaceOne({ matchId, type }, doc, { upsert: true });
    res.status(result.upsertedCount ? 201 : 200).json({
      matchId,
      type,
      created: result.upsertedCount > 0,
    });
  }),
);

router.delete(
  '/:type/:matchId',
  requireApiKey,
  asyncHandler(async (req, res) => {
    const type = pathType(req);
    const result = await MatchModel.deleteOne({ matchId: req.params.matchId, type });
    res.json({ matchId: req.params.matchId, type, deleted: result.deletedCount });
  }),
);

export default router;
