import { Request, Response, NextFunction, RequestHandler } from 'express';
import { isMatchType, MATCH_TYPES, MatchType } from '../models/Match';

/** An error the error handler turns into `{ error }` with this status. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Every value of a repeatable or comma-separated query param. */
export function queryList(req: Request, name: string): string[] | undefined {
  const raw = req.query[name];
  const values = (Array.isArray(raw) ? raw : raw == null ? [] : [raw])
    .filter((v): v is string => typeof v === 'string')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

export function queryInt(
  req: Request,
  name: string,
  opts: { min?: number; max?: number } = {},
): number | undefined {
  const raw = req.query[name];
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(n) || (opts.min != null && n < opts.min)) {
    throw new HttpError(400, `${name} must be an integer${opts.min != null ? ` >= ${opts.min}` : ''}`);
  }
  return opts.max != null ? Math.min(n, opts.max) : n;
}

export function queryType(req: Request): MatchType | undefined {
  const raw = req.query.type;
  if (raw == null || raw === '') return undefined;
  if (!isMatchType(raw)) {
    throw new HttpError(400, `type must be one of ${MATCH_TYPES.join(', ')}`);
  }
  return raw;
}

export function pathType(req: Request): MatchType {
  const t = req.params.type;
  if (!isMatchType(t)) {
    throw new HttpError(404, `unknown match type "${t}"`);
  }
  return t;
}

export function queryEnum<T extends string>(req: Request, name: string, allowed: readonly T[], fallback: T): T {
  const raw = req.query[name];
  if (raw == null || raw === '') return fallback;
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
    throw new HttpError(400, `${name} must be one of ${allowed.join(', ')}`);
  }
  return raw as T;
}
