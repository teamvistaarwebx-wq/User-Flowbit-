import { cronHandler } from '@/lib/cron'
import { publishDuePosts } from '@/modules/work/posts/publish'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json, every 15 minutes): publishes scheduled posts in Work → Posts. */
export const GET = cronHandler('posts', (db) => publishDuePosts(db))
