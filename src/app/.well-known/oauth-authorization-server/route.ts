import { corsJson, preflight, publicOrigin } from '@/modules/mcp/http'
import { authorizationServerMetadata } from '@/modules/mcp/oauth/metadata'

export const runtime = 'nodejs'

/** RFC 8414 authorization server metadata (PKCE S256, dynamic client registration, refresh, revocation). */
export const GET = () => corsJson(authorizationServerMetadata(publicOrigin()), 200, { 'Cache-Control': 'public, max-age=3600' })
export const OPTIONS = () => preflight()
