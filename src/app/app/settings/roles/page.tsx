import type { Metadata } from 'next'
import { breadcrumbFor, PRODUCT_KEYS } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { BUILTIN_ROLE_KEYS, BUILTIN_ROLES } from '@/lib/permissions'
import { PageHeader } from '@/components/ui/page-header'
import { RoleMatrix } from '@/components/settings/role-matrix'
import type { RoleColumn } from '@/components/settings/role-editor'
import { Member } from '@/models/Member'
import { customRolesOf } from '@/modules/settings/role-access'
import { missingGrants, permissionGroups } from '@/modules/settings/roles'

export const metadata: Metadata = { title: 'Roles' }

export default async function RolesPage() {
  const ctx = await requireMember({ perm: 'roles.manage' })
  const [customRoles, counts] = await Promise.all([
    customRolesOf(ctx),
    ctx.db(Member).aggregate<{ _id: string; n: number }>([{ $match: { status: { $ne: 'disabled' } } }, { $group: { _id: '$role', n: { $sum: 1 } } }]),
  ])
  const holders = (key: string) => counts.find((c) => c._id === key)?.n ?? 0
  const groups = permissionGroups()
  const allKeys = groups.flatMap((g) => g.permissions.map((p) => p.key))
  const grantable = ctx.isOwner ? allKeys : allKeys.filter((k) => ctx.permissions.has(k))
  const canEdit = (perms: readonly string[]) => ctx.isOwner || missingGrants(ctx.permissions, perms).length === 0

  const roles: RoleColumn[] = [
    ...BUILTIN_ROLE_KEYS.map((key) => ({
      id: key,
      label: BUILTIN_ROLES[key].label,
      description: BUILTIN_ROLES[key].description,
      permissions: [...BUILTIN_ROLES[key].permissions],
      builtIn: true,
      owner: key === 'owner',
      editable: false,
      holders: holders(key),
    })),
    ...customRoles.map((r) => ({
      id: String(r._id),
      label: r.label,
      description: r.description ?? '',
      permissions: [...r.permissions],
      builtIn: false,
      owner: false,
      editable: canEdit(r.permissions),
      holders: holders(String(r._id)),
    })),
  ]
  const lockedAreas = PRODUCT_KEYS.filter((p) => !ctx.entitlements.entitledProducts.includes(p))

  return (
    <>
      <PageHeader title="Roles" help="manager-role" description="What each role can do. Give roles to people on Members. A role is a set of permissions; a reporting manager is set on each employee record." breadcrumb={breadcrumbFor('/app/settings/roles')} />
      <RoleMatrix groups={groups} roles={roles} lockedAreas={lockedAreas} grantable={grantable} />
    </>
  )
}
