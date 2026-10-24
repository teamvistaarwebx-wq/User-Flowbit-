import { after } from 'next/server'
import { requireMember } from '@/lib/ctx'
import { serverEnv } from '@/lib/env'
import { AppShell } from '@/components/shell/app-shell'
import { getShellData } from '@/components/shell/data'
import { DisabledWorkspace } from '@/components/shell/disabled-workspace'
import { ensureTrialReminders } from '@/modules/subscription/reminders'

/**
 * Signed-in frame. Pages still call requireMember() with their own perm/product checks.
 * `panel`: the task side panel slot (@panel), filled when a task link is clicked inside the app.
 */
export default async function AppLayout({ children, panel }: { children: React.ReactNode; panel: React.ReactNode }) {
  const ctx = await requireMember({ allowBlocked: true, allowWithout2fa: true })
  if (ctx.org.disabled) return <DisabledWorkspace name={ctx.org.name} reason={ctx.org.disabledReason} supportEmail={serverEnv().SUPPORT_EMAIL} />
  // Trial reminders are idempotent (dedupeKey) and log their own failures; run them after the response.
  after(() => ensureTrialReminders(ctx))
  const data = await getShellData(ctx)
  return <AppShell data={data} panel={panel}>{children}</AppShell>
}
