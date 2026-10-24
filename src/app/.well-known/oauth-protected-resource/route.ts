import { corsJson, preflight, publicOrigin } from '@/modules/mcp/http'
import { protectedResourceMetadata } from '@/modules/mcp/oauth/metadata'

export const runtime = 'nodejs'

/** RFC 9728 protected resource metadata of Flowbit's MCP server (/mcp). */
export const GET = () => corsJson(protectedResourceMetadata(publicOrigin()), 200, { 'Cache-Control': 'public, max-age=3600' })
export const OPTIONS = () => preflight()
