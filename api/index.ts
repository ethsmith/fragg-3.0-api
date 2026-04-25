/**
 * Vercel serverless entry point.
 *
 * Vercel auto-detects files in `/api` and exposes them as serverless
 * functions. `vercel.json` rewrites all incoming traffic to `/api`, so
 * this single function handles every request and delegates to the
 * existing Express app.
 */

import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'http';
import app from '../src/app';
import { connectDB } from '../src/config/db';

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    await connectDB();
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Database connection failed' }));
    return;
  }

  // An Express app instance is itself a (req, res) => void function.
  (app as unknown as NodeHandler)(req, res);
}
