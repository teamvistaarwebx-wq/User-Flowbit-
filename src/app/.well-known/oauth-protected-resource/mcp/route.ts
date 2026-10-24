import { corsJson, preflight, publicOrigin } from '@/modules/mcp/http'
import { protectedResourceMetadata } from '@/modules/mcp/oauth/metadata'

export const runtime = 'nodejs'

/** The path-suffixed form (RFC 9728 §3.1) that MCP clients try first for https://…/mcp. */
export const GET = () => corsJson(protectedResourceMetadata(publicOrigin()), 200, { 'Cache-Control': 'public, max-age=3600' })
export const OPTIONS = () => preflight()
