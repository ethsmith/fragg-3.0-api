/**
 * requireApiKey middleware.
 *
 * Gates write/mutation endpoints behind a shared secret stored in
 * `process.env.API_KEY`. Reads two header formats, in this order:
 *
 *   1. Authorization: Bearer <key>
 *   2. x-api-key: <key>
 *
 * Behavior:
 *   - 500 if the server has no API_KEY configured (fail closed — a missing
 *     env var must never silently allow writes).
 *   - 401 if no credential is presented.
 *   - 403 if the credential doesn't match.
 *
 * The comparison uses `crypto.timingSafeEqual` on Buffers of equal length so
 * the response time doesn't leak information about how many leading
 * characters were correct.
 */

import { RequestHandler } from 'express';
import { timingSafeEqual } from 'crypto';

function extractKey(req: Parameters<RequestHandler>[0]): string | null {
  const auth = req.header('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice('bearer '.length).trim() || null;
  }
  const xKey = req.header('x-api-key');
  if (typeof xKey === 'string' && xKey.length > 0) return xKey;
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const requireApiKey: RequestHandler = (req, res, next) => {
  const expected = process.env.API_KEY;
  if (!expected) {
    console.error(
      'API_KEY is not set. Refusing the request to avoid an unauthenticated write.',
    );
    res.status(500).json({ error: 'Server is missing API_KEY configuration' });
    return;
  }

  const provided = extractKey(req);
  if (!provided) {
    res.status(401).json({
      error: 'Missing API key. Send "Authorization: Bearer <key>" or "x-api-key: <key>".',
    });
    return;
  }

  if (!safeEqual(provided, expected)) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
};
