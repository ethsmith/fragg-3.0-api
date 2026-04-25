import mongoose from 'mongoose';

/**
 * MongoDB connection helper.
 *
 * On Vercel, the MongoDB Atlas integration injects MONGODB_URI (and usually
 * MONGODB_DATABASE) into the project's environment. Locally, these are read
 * from .env via dotenv (loaded in bin/www.ts).
 *
 * The connection is cached on `globalThis` so that:
 *   - In dev, hot-reloads (ts-node-dev) reuse the same connection.
 *   - On Vercel serverless, warm invocations of the same instance reuse it
 *     instead of opening a fresh connection on every request.
 */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache =
  global.__mongooseCache ?? { conn: null, promise: null };

if (!global.__mongooseCache) {
  global.__mongooseCache = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Define it in .env locally, or via the ' +
        'Vercel MongoDB Atlas integration in production.',
    );
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const dbName = process.env.MONGODB_DATABASE || undefined;
    cached.promise = mongoose
      .connect(uri, {
        dbName,
        // Recommended for serverless: don't buffer commands while disconnected.
        bufferCommands: false,
        serverSelectionTimeoutMS: 10_000,
      })
      .then((m) => {
        return m;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

export async function disconnectDB(): Promise<void> {
  if (cached.conn) {
    await cached.conn.disconnect();
    cached.conn = null;
    cached.promise = null;
  }
}

export { mongoose };
