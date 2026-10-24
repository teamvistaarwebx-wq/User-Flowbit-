import type { Metadata } from 'next'
import { brandColorsAllowed, resolveTheme } from '@/lib/brand-theme'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { PageHeader } from '@/components/ui/page-header'
import { AppearanceSettings } from '@/components/settings/appearance-settings'
import { BrandColorsForm } from '@/components/settings/brand-colors-form'
import { AvatarStyleForm } from '@/components/settings/avatar-style-form'
import { isAvatarStyle } from '@/lib/avatar-pattern'

export const metadata: Metadata = { title: 'Appearance' }

export default async function AppearancePage() {
  const ctx = await requireMember()
  const prefs = ctx.user.prefs
  const motion = prefs?.motion === 'reduce' || prefs?.reducedMotion ? 'reduce' : prefs?.motion === 'full' ? 'full' : 'system'
  const canBrand = ctx.can('org.manage')
  const allowed = brandColorsAllowed(ctx.org)
  const planNote = !allowed ? 'Suite plan only' : ctx.entitlements.trialing ? 'Suite plan · free during your trial' : 'Included in Suite'
  return (
    <>
      <PageHeader title="Appearance" help="brand-colours" description="Sounds and motion for you; brand colours and default avatars for the whole workspace." breadcrumb={breadcrumbFor('/app/settings/appearance')} />
      <div className="space-y-4">
        {canBrand ? (
          <div className="grid grid-cols-12 gap-4">
            <BrandColorsForm initial={resolveTheme(ctx.org.theme)} allowed={allowed} planNote={planNote} />
            <AvatarStyleForm initial={isAvatarStyle(ctx.org.avatarStyle) ? ctx.org.avatarStyle : 'initials'} />
          </div>
        ) : null}
        <AppearanceSettings motion={motion} />
      </div>
    </>
  )
}
