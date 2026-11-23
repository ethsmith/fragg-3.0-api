import express, { Application, Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';

import matchesRouter from './routes/matches';
import playersRouter from './routes/players';
import teamsRouter from './routes/teams';
import metaRouter from './routes/meta';
import { HttpError } from './routes/util';

const app: Application = express();

// Permissive CORS for browser clients. Reads are public; writes (PUT/DELETE)
// are gated by the API key in `requireApiKey`, so allowing any origin is safe.
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Encoding, x-api-key, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

/**
 * Reads are public and only change when the worker ingests a map, so let the
 * CDN hold GET responses for a few minutes (s-maxage=300) and serve stale
 * while refreshing (stale-while-revalidate=600). Browsers always revalidate.
 * Routes that must not be cached (the worker's HEAD check) override this.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  }
  next();
});

app.use(logger('dev'));
// A full payload (every round's player rows) runs to a few MB of JSON; the
// worker gzips it, and body-parser inflates Content-Encoding: gzip itself.
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/matches', matchesRouter);
app.use('/players', playersRouter);
app.use('/teams', teamsRouter);
app.use('/meta', metaRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `no route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const status = (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode;
  if (status && status >= 400 && status < 500) {
    // body-parser errors: malformed JSON, body too large, bad encoding.
    res.status(status).json({ error: (err as Error).message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

export default app;
