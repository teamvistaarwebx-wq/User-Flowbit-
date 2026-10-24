import 'server-only'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { GUIDE_UPDATING } from './guide'
import type { McpSession } from './session'
import { workspaceContext } from './tools/context'
import { myDay } from './tools/reads'
import { redact } from './never'
import { resourceSections } from './rules'
import { buildAccess } from './tools/access'

/** Background an AI reads first (docs/specs/mcp.md A5). */

const json = (uri: URL, data: unknown) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(redact(data), null, 1) }] })

export function registerResources(server: McpServer, session: McpSession): void {
  server.registerResource('workspace-context', 'flowbit://workspace/context', { title: 'Workspace context', description: 'Products on, task statuses and priorities, projects and spaces, pipeline stages, lead sources, Folio firms and GST rates. Read this before changing anything.', mimeType: 'application/json' }, async (uri) => json(uri, await workspaceContext(session)))
  server.registerResource('me-today', 'flowbit://me/today', { title: 'My day', description: 'My tasks due today, overdue, blocked, meetings and follow-ups (the daily brief).', mimeType: 'application/json' }, async (uri) => {
    const allowed = resourceSections(buildAccess(session))
    return json(uri, allowed.myDay ? await myDay(session.ctx, { followups: allowed.followups }) : { note: 'This connection cannot read tasks (scope work.read), or Work is not on for this workspace.' })
  })
  server.registerResource('guide-updating', 'flowbit://guide/updating', { title: 'How to update Flowbit', description: 'Find before create, plan → apply for more than 3 changes, never invent clients.', mimeType: 'text/markdown' }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIDE_UPDATING }] }))
}
