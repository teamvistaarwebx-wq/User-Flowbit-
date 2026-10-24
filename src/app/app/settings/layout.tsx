import { SIDE_PANELS } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { APP_VERSION_LABEL } from '@/lib/version'
import { SettingsNav, type SettingsLink } from '@/components/settings/settings-nav'

/** Settings frame: section pills on small screens (the shell's side panel lists them on large ones). */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireMember({ allowBlocked: true, allowWithout2fa: true })
  // Same gates as the side panel (perm, or any of anyPerm); each pill carries its section for the group labels.
  const links: SettingsLink[] = SIDE_PANELS.settings.flatMap((section) =>
    (section.links ?? [])
      .filter((link) => (!link.perm || ctx.can(link.perm)) && (!link.anyPerm?.length || link.anyPerm.some((p) => ctx.can(p))))
      .map((link) => ({ href: link.href, label: link.label, icon: link.icon, section: section.label })),
  )
  return (
    <>
      <SettingsNav links={links} />
      {children}
      <p className="mt-10 pb-2 text-center text-xs text-fg-3">{APP_VERSION_LABEL}</p>
    </>
  )
}
