/**
 * GET /meta: what the database holds, for building filters.
 *
 *   {
 *     seasons: [{ season, types: [{ type, maps, fullStatsMaps }] }],   newest season first
 *     engineVersions: [{ engineVersion, maps }],
 *     fields: { player: [...numeric fields /players can sort or select on] }
 *   }
 */

import { Router } from 'express';
import { MatchModel } from '../models/Match';
import { playerFieldNames } from '../stats/aggregate';
import { asyncHandler } from './util';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [seasons, engineVersions] = await Promise.all([
      MatchModel.aggregate([
        {
          $group: {
            _id: { season: '$season', type: '$type' },
            maps: { $sum: 1 },
            fullStatsMaps: { $sum: { $cond: ['$fullStatsOK', 1, 0] } },
          },
        },
        { $sort: { '_id.type': 1 } },
        {
          $group: {
            _id: '$_id.season',
            types: { $push: { type: '$_id.type', maps: '$maps', fullStatsMaps: '$fullStatsMaps' } },
          },
        },
        { $sort: { _id: -1 } },
        { $project: { _id: 0, season: '$_id', types: 1 } },
      ]),
      MatchModel.aggregate([
        { $group: { _id: '$engineVersion', maps: { $sum: 1 } } },
        { $sort: { maps: -1 } },
        { $project: { _id: 0, engineVersion: '$_id', maps: 1 } },
      ]),
    ]);
    res.json({ seasons, engineVersions, fields: { player: playerFieldNames() } });
  }),
);

export default router;
