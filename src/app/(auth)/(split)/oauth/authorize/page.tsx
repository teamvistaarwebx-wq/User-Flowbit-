import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { dbConnect } from '@/lib/db'
import { appUrl } from '@/lib/env'
import { first, type SearchParams } from '@/lib/list'
import { ConsentForm } from '@/components/mcp/consent-form'
import { AuthCard } from '../../../_components/auth-card'
import { consentWorkspaces } from '@/modules/mcp/consent'
import { checkAuthorize } from '@/modules/mcp/oauth/core'
import { mcpResourceUrl } from '@/modules/mcp/oauth/metadata'
import { mongoOAuthStore } from '@/modules/mcp/oauth/store'
import { SCOPE_DEFS } from '@/modules/mcp/scopes'

export const metadata: Metadata = { title: 'Connect an AI app', robots: { index: false } }

const KEYS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'scope', 'state', 'resource'] as const

/**
 * OAuth consent (docs/specs/mcp.md A1): uses the person's Flowbit session,
 * lets them pick a workspace and untick scopes. An unknown app or a return
 * address that does not match exactly stops here and never redirects.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const p = Object.fromEntries(KEYS.map((k) => [k, first(sp[k]) ?? null])) as Record<(typeof KEYS)[number], string | null>
  await dbConnect()
  const check = await checkAuthorize(mongoOAuthStore, p, mcpResourceUrl(appUrl('')))
  if (!check.ok && !check.fatal) redirect(check.redirectTo)
  if (!check.ok) {
    return (
      <AuthCard title="Can’t connect" brandWord={null} subtitle={check.message}>
        <p className="text-center text-sm text-fg-2">Close this window and start again from Claude or ChatGPT.</p>
      </AuthCard>
    )
  }
  const current = await getSession()
  if (!current) {
    const query = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => Boolean(e[1]))).toString()
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`)
  }
  const { request } = check
  const workspaces = await consentWorkspaces(current.user, current.session, request.scopes)
  const host = new URL(request.redirectUri).host
  return (
    <AuthCard title={`Connect ${request.client.clientName} to`} subtitle={<>Signed in as {current.user.email}. {request.client.clientName} will act as you, only within what your role allows.</>}>
      <ConsentForm
        clientName={request.client.clientName}
        returnHost={host}
        params={{ client_id: request.client.clientId, redirect_uri: request.redirectUri, code_challenge: request.codeChallenge, code_challenge_method: 'S256', state: request.state ?? undefined, scope: request.scopes.join(' ') || undefined, resource: request.resource ?? undefined }}
        workspaces={workspaces}
        scopeInfo={Object.fromEntries(Object.entries(SCOPE_DEFS).map(([k, v]) => [k, { label: v.label, description: v.description }]))}
      />
    </AuthCard>
  )
}
