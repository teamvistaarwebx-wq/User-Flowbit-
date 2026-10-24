import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { UserError } from '@/lib/errors'
import { redact } from '../never'
import { accessRefusal, type Requirement } from '../rules'
import type { McpSession } from '../session'
import { buildAccess } from './access'

/**
 * One MCP tool: input schema (zod), the scope ∩ role requirement checked on
 * every call, structured output with links, and read-only / destructive
 * hints. Errors become tool errors the AI can show; nothing internal leaks.
 */

export type ToolKind = 'read' | 'create' | 'update'

export type ToolDef<S extends z.ZodRawShape> = Readonly<{
  name: string
  title: string
  description: string
  input: S
  /** null: no scope needed (whoami). */
  req: Requirement | null
  kind: ToolKind
  idempotent?: boolean
}>

const ANNOTATIONS: Readonly<Record<ToolKind, ToolAnnotations>> = {
  read: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  create: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  update: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}

export const toolError = (message: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text: message }] })

/** Structured output (redacted) plus the same JSON as text for clients that only read text. */
export function toolResult(data: unknown): CallToolResult {
  const clean = redact(data)
  const structured = (clean && typeof clean === 'object' && !Array.isArray(clean) ? clean : { result: clean }) as Record<string, unknown>
  return { content: [{ type: 'text', text: JSON.stringify(structured, null, 1) }], structuredContent: structured }
}

export function errorMessage(error: unknown, tool: string): string {
  if (error instanceof UserError) return error.message
  if (error instanceof z.ZodError) return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
  console.error(`[mcp] tool ${tool} failed`, error)
  return 'Something went wrong in Flowbit. Try again in a moment.'
}

export function defineTool<S extends z.ZodRawShape>(server: McpServer, session: McpSession, def: ToolDef<S>, run: (args: z.output<z.ZodObject<S>>) => Promise<unknown>): void {
  const handler = async (args: z.output<z.ZodObject<S>>): Promise<CallToolResult> => {
    if (def.req) {
      const refusal = accessRefusal(buildAccess(session), def.req)
      if (refusal) return toolError(refusal)
    }
    try {
      return toolResult(await run(args))
    } catch (error) {
      return toolError(errorMessage(error, def.name))
    }
  }
  server.registerTool(def.name, { title: def.title, description: def.description, inputSchema: def.input, annotations: { title: def.title, ...ANNOTATIONS[def.kind], ...(def.idempotent ? { idempotentHint: true } : {}) } }, handler as never)
}
