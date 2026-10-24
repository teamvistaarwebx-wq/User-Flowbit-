import type { Metadata } from 'next'
import { DecideForm } from '@/components/actionlinks/decide-form'
import { PublicCard, PublicShell, Unavailable } from '@/components/doclinks/public-shell'
import { getSession } from '@/lib/auth/session'
import { WORKSPACE_THEME_FIELDS, workspacePrimary } from '@/lib/brand-theme'
import { Org } from '@/models/Org'
import { previewActionLink } from '@/modules/actionlinks/execute'
import { choiceLabel, isActionChoice, KIND_RULES } from '@/modules/actionlinks/kinds'
import { LINK_PROBLEM_TEXT, linkProblem } from '@/modules/actionlinks/token'

export const dynamic = 'force-dynamic'

/** Never indexed or cached: the link belongs to one approver. */
export const metadata: Metadata = { title: 'Confirm', robots: { index: false, follow: false } }

/**
 * /a/<signed token>: the page an emailed Approve / Reject link opens. It
 * shows the request and asks the approver to confirm; opening it changes
 * nothing (mail scanners pre-fetch links). The decision runs the app's own
 * checks for the person the link was sent to.
 */
export default async function ActionLinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ c?: string }> }) {
  const [{ token }, { c }] = await Promise.all([params, searchParams])
  const preview = await previewActionLink(token)
  if (!preview) return <Unavailable title="This link is not valid" body={LINK_PROBLEM_TEXT.invalid} />
  const { row, summary } = preview
  const session = await getSession().catch(() => null)
  const now = new Date()
  const problem = linkProblem(row, { userId: session ? String(session.user._id) : null }, row.choices[0] ?? '', now)
  const rules = KIND_RULES[row.kind]
  const org = await Org.findById(row.orgId, { ...WORKSPACE_THEME_FIELDS, name: 1 }).lean()
  const brand = { name: org?.name ?? preview.orgName, legalName: null, addressLines: [], gstin: null, email: null, phone: null, logoSrc: null, color: workspacePrimary(org) }
  const openInApp = { href: rules.href(row.subjectId), label: 'Open in Flowbit' }
  if (problem === 'sign_in') return <Unavailable title="Sign in to decide this" body={LINK_PROBLEM_TEXT.sign_in} action={{ href: `/login?next=${encodeURIComponent(`/a/${token}`)}`, label: 'Sign in' }} />
  if (problem && problem !== 'busy') return <Unavailable title={problem === 'used' ? 'Already done' : problem === 'expired' ? 'This link has expired' : 'This link cannot be used here'} body={LINK_PROBLEM_TEXT[problem]} action={openInApp} />
  if (!summary) return <Unavailable title="Not available" body="The request was removed, or you can no longer decide it. Open Flowbit to see the latest." action={openInApp} />
  return (
    <PublicShell brand={brand}>
      <PublicCard className="space-y-4">
        <p className="text-xs uppercase tracking-[0.06em] text-white/60">{rules.label}{preview.memberName ? ` · for ${preview.memberName}` : ''}</p>
        <h1 className="text-xl font-semibold text-white">{summary.title}</h1>
        <ul className="space-y-1 text-sm text-white/80">
          {summary.lines.map((line) => (
            <li key={line} className="whitespace-pre-line">{line}</li>
          ))}
        </ul>
        {summary.open ? (
          <DecideForm token={token} options={row.choices.filter(isActionChoice).map((choice) => ({ choice, label: choiceLabel(row.kind, choice) }))} initial={isActionChoice(c) ? c : null} rejectNote={rules.rejectNote} noteMin={rules.noteMin} />
        ) : (
          <p className="text-sm text-white/70">This is already {summary.state}. Nothing more to do.</p>
        )}
        <p className="text-xs text-white/50">The same checks as in Flowbit apply: your role, the approval stage and locked months.</p>
      </PublicCard>
    </PublicShell>
  )
}
