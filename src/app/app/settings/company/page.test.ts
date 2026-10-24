import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ requireMember: vi.fn(), redirect: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: h.redirect }))
vi.mock('@/lib/ctx', () => ({ requireMember: h.requireMember }))
vi.mock('@/lib/files', () => ({ fileUrl: (id: unknown) => `/api/files/${String(id)}` }))
vi.mock('@/components/ui/page-header', () => ({ PageHeader: () => null }))
vi.mock('@/components/settings/company/logo-card', () => ({ CompanyLogoCard: () => null }))
vi.mock('@/components/settings/company/profile-form', () => ({ CompanyProfileForm: () => null }))
vi.mock('@/components/settings/company/signatories-card', () => ({ SignatoriesCard: () => null }))
vi.mock('@/components/activation/checklist-card', () => ({ SampleDataBar: () => null }))
vi.mock('@/modules/activation/store', () => ({ workspaceHasSample: async () => false }))

describe('Settings → Company profile page', () => {
  it('refuses members without org.manage the standard way (/app/denied through requireMember)', async () => {
    // Arrange: requireMember refuses (it redirects to /app/denied in the app).
    const refused = new Error('NEXT_REDIRECT /app/denied')
    h.requireMember.mockRejectedValueOnce(refused)
    const { default: CompanyProfilePage } = await import('./page')

    // Act / Assert
    await expect(CompanyProfilePage()).rejects.toBe(refused)
    expect(h.requireMember).toHaveBeenCalledWith({ perm: 'org.manage' })
    expect(h.redirect).not.toHaveBeenCalled()
  })
})
