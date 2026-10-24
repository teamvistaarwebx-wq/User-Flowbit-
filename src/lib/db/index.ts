import mongoose from 'mongoose'
import { serverEnv } from '@/lib/env'

/**
 * Cached Mongoose connection. Cached on globalThis so dev reloads, concurrent
 * requests and warm serverless invocations (Vercel) share one pool. The local
 * server is replica set rs0 and Atlas is always a replica set, so transactions
 * (`withTransaction`) are available in both.
 */
declare global {
  var __flowbitMongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | undefined
}

const SERVER_SELECTION_TIMEOUT_MS = 8000
const MAX_POOL_SIZE = 10
const MAX_IDLE_TIME_MS = 60_000

/**
 * Production servers never build indexes or create collections on their own:
 * each Vercel cold start would otherwise send createIndexes for every model it
 * loads (dozens of commands; Atlas M0 caps operations per second). `npm run
 * setup:prod` creates them explicitly; re-run it after a deploy that adds a
 * model or an index. Development and tests (and the tsx scripts) keep both on.
 */
const BUILD_INDEXES = process.env.NODE_ENV !== 'production'

const cache = globalThis.__flowbitMongoose ?? { conn: null, promise: null }
globalThis.__flowbitMongoose = cache

export async function dbConnect(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn
  if (!cache.promise) {
    const env = serverEnv()
    cache.promise = mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB,
      bufferCommands: false,
      autoIndex: BUILD_INDEXES,
      autoCreate: BUILD_INDEXES,
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      // Serverless: each function instance keeps a small pool and lets idle sockets go,
      // so many instances never exhaust Atlas's connection limit (M0: 500).
      maxPoolSize: MAX_POOL_SIZE,
      minPoolSize: 0,
      maxIdleTimeMS: MAX_IDLE_TIME_MS,
      // Atlas URIs carry retryWrites=true&w=majority; these keep the same behaviour when a URI omits them.
      retryWrites: true,
      retryReads: true,
    })
  }
  try {
    cache.conn = await cache.promise
  } catch (error) {
    cache.promise = null
    throw error
  }
  return cache.conn
}

export async function dbDisconnect(): Promise<void> {
  if (!cache.conn) return
  await cache.conn.disconnect()
  cache.conn = null
  cache.promise = null
}

/** Runs `fn` inside a MongoDB transaction; pass `{ session }` to every write. */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const conn = await dbConnect()
  const session = await conn.startSession()
  try {
    let result: T | undefined
    await session.withTransaction(async () => {
      result = await fn(session)
    })
    return result as T
  } finally {
    await session.endSession()
  }
}

export { mongoose }
