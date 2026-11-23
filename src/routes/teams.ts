/**
 * /teams: team rows folded across maps.
 *
 *   GET /teams          one record per team name: maps, mapsWon, mapsTied, roundsWon,
 *                       roundsLost and every team-row counter summed
 *        ?season= &type= &name= (repeatable or comma list)
 */

import { Router } from 'express';
import { MatchModel } from '../models/Match';
import { teamPipeline } from '../stats/aggregate';
import { asyncHandler, queryInt, queryList, queryType } from './util';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const results = await MatchModel.aggregate(
      teamPipeline({
        season: queryInt(req, 'season', { min: 1 }),
        type: queryType(req),
        names: queryList(req, 'name'),
      }),
      { allowDiskUse: true },
    );
    res.json({ count: results.length, results });
  }),
);

export default router;
