import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Ban, Inbox, Kanban, Layers, Lock, Settings, ShoppingBag, Target, Waypoints, Wrench } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { first, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { ListEditor } from '@/components/orbit/list-editor'
import { PanelHeader, SolidCard } from '@/components/orbit/parts'
import { GeneralForm, TargetsForm } from '@/components/orbit/settings-forms'
import { LeadStageBadge } from '@/components/orbit/stage-badge'
import { LEAD_STAGES, LEAD_STAGE_RULE } from '@/modules/orbit/constants'
import { orbitPeople, reviewerOptions } from '@/modules/orbit/people'
import { getOrbitSettings } from '@/modules/orbit/settings'
import { LeadCaptureSettings } from '@/components/orbit/lead-capture'
import { formatDateTime } from '@/lib/dates'
import { getLeadCapture, leadEmbedUrl, leadFormUrl, leadHookUrl } from '@/modules/orbit/capture/settings'

export const metadata: Metadata = { title: 'Orbit settings' }
const BASE = '/app/orbit/settings'
const TABS = [
  { key: 'stages', label: 'Deal stages', icon: <Kanban /> },
  { key: 'lead-stages', label: 'Lead stages', icon: <Layers /> },
  { key: 'sources', label: 'Sources', icon: <Waypoints /> },
  { key: 'sectors', label: 'Sectors', icon: <ShoppingBag /> },
  { key: 'reasons', label: 'Close reasons', icon: <Ban /> },
  { key: 'targets', label: 'Targets', icon: <Target /> },
  { key: 'general', label: 'General', icon: <Wrench /> },
  { key: 'capture', label: 'Lead capture', icon: <Inbox /> },
] as const

/** Settings sections as the side panel lists them: a 12/600 uppercase label, 14/400 items at a 26px pitch. */
function SectionNav({ active }: { active: string }) {
  return (
    <nav aria-label="Orbit settings sections" className="min-w-0 lg:sticky lg:top-4">
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.06em] text-white">Orbit</p>
      <ul className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-col lg:gap-0">
        {TABS.map((t) => (
          <li key={t.key}>
            <Link
              href={t.key === 'stages' ? BASE : `${BASE}?tab=${t.key}`}
              aria-current={t.key === active ? 'page' : undefined}
              className={cn('flex h-[30px] items-center gap-2.5 whitespace-nowrap rounded-[8px] px-2 text-sm transition-colors [&_svg]:size-[15px] [&_svg]:shrink-0', t.key === active ? 'bg-white/[0.08] text-white' : 'text-white/85 hover:bg-white/[0.04] hover:text-white [&_svg]:text-icon-muted')}
            >
              {t.icon}
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Section({ icon, title, subtitle, children, className }: { icon: ReactNode; title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <SolidCard className={cn('rounded-[12px]', className)}>
      <PanelHeader icon={icon} title={title} subtitle={subtitle} className="mb-5" />
      {children}
    </SolidCard>
  )
}

export default async function OrbitSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.settings' })
  const tab = TABS.find((t) => t.key === first(sp.tab))?.key ?? 'stages'
  const cfg = await getOrbitSettings(ctx)
  const canEdit = !ctx.readOnly

  return (
    <>
      <PageHeader title="Orbit settings" description="Deal stages, sources, sectors, close reasons and targets for this workspace." breadcrumb={breadcrumbFor(BASE)} icon={<Settings />} />
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
        <SectionNav active={tab} />
        <div className="min-w-0 max-w-3xl">
          {tab === 'stages' ? (
            <Section icon={<Kanban />} title="Deal stages" subtitle="1 to 8 open stages, each with a default probability. Won and Lost are fixed.">
              <ListEditor kind="stages" canEdit={canEdit} initial={cfg.dealStages.map((s) => ({ key: s.key, label: s.label, probability: s.probability, color: s.color }))} />
            </Section>
          ) : null}
          {tab === 'lead-stages' ? (
            <Section icon={<Lock />} title="Lead stages" subtitle="Lead stages are fixed: Cold % and Warm % are defined by them.">
              <ul>
                {LEAD_STAGES.map((s) => (
                  <li key={s} className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-4 border-b border-white/[0.06] py-2.5 last:border-0">
                    <span><LeadStageBadge stage={s} /></span>
                    <span className="text-[13px] text-fg-2">{LEAD_STAGE_RULE[s]}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {tab === 'sources' ? (
            <Section icon={<Waypoints />} title="Sources" subtitle="Where leads come from. Removing a source in use is refused; deactivate it instead.">
              <ListEditor kind="sources" canEdit={canEdit} hint="Warm sources may skip Contacted: an inbound lead can go straight from New to Engaged once their message is logged." initial={cfg.sources.map((s) => ({ key: s.key, label: s.label, warm: s.warm, active: s.active }))} />
            </Section>
          ) : null}
          {tab === 'sectors' ? (
            <Section icon={<ShoppingBag />} title="Sectors" subtitle="Exactly one primary sector (your main motion).">
              <ListEditor kind="sectors" canEdit={canEdit} initial={cfg.sectors.map((s) => ({ key: s.key, label: s.label, primary: s.primary, active: s.active }))} />
            </Section>
          ) : null}
          {tab === 'reasons' ? (
            <div className="space-y-3">
              <Section icon={<Ban />} title="Lost reasons" subtitle="Used for lost and disqualified leads and lost deals. 'Other' always stays.">
                <ListEditor kind="lost" canEdit={canEdit} initial={cfg.lostReasons.map((r) => ({ key: r.key, label: r.label, active: r.active }))} />
              </Section>
              <Section icon={<Target />} title="Won reasons" subtitle="Optional when a deal is won.">
                <ListEditor kind="won" canEdit={canEdit} initial={cfg.wonReasons.map((r) => ({ key: r.key, label: r.label, active: r.active }))} />
              </Section>
            </div>
          ) : null}
          {tab === 'targets' ? (
            <Section icon={<Target />} title="Targets" subtitle="What Today and the reports measure against.">
              <TargetsForm targets={cfg.targets} canEdit={canEdit} />
            </Section>
          ) : null}
          {tab === 'general' ? (
            <Section icon={<Wrench />} title="General">
              <GeneralForm staleDays={cfg.staleDays} defaultReviewerId={cfg.defaultReviewerId} reviewers={reviewerOptions(await orbitPeople(ctx))} canEdit={canEdit} />
            </Section>
          ) : null}
          {tab === 'capture' ? <CaptureSection ctx={ctx} canEdit={canEdit} /> : null}
        </div>
      </div>
    </>
  )
}

/** Lead sources: website form, webhook, IndiaMART (beta) and assignment. */
async function CaptureSection({ ctx, canEdit }: { ctx: Awaited<ReturnType<typeof requireMember>>; canEdit: boolean }) {
  const [capture, people] = await Promise.all([getLeadCapture(ctx.orgId), orbitPeople(ctx)])
  return (
    <Section icon={<Inbox />} title="Lead capture" subtitle="Website form, webhook (Zapier, Meta lead ads, JustDial), IndiaMART and who new leads go to.">
      <LeadCaptureSettings
        formEnabled={capture.formEnabled}
        allowedOrigins={capture.allowedOrigins}
        thankYouUrl={capture.thankYouUrl}
        formUrl={leadFormUrl(capture.formKey)}
        embedUrl={leadEmbedUrl(capture.formKey)}
        hookEnabled={capture.hookEnabled}
        hookUrl={leadHookUrl(capture.hookKey)}
        hookTokenLast4={capture.hookTokenLast4}
        assignMode={capture.assignMode}
        ownerMemberId={capture.ownerMemberId}
        poolMemberIds={capture.poolMemberIds}
        people={people.filter((p) => p.active && p.canWrite).map((p) => ({ id: p.id, name: p.name }))}
        indiamart={{ enabled: capture.indiamart.enabled, keyLast4: capture.indiamart.keyLast4, lastPulled: capture.indiamart.lastPulledAt ? formatDateTime(capture.indiamart.lastPulledAt) : null, lastError: capture.indiamart.lastError, lastCount: capture.indiamart.lastCount }}
        canEdit={canEdit}
      />
    </Section>
  )
}
