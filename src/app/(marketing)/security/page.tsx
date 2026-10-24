import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { CtaBand } from '@/components/marketing/cta-band'
import { Mesh } from '@/components/marketing/mesh'
import { Section } from '@/components/marketing/section'
import { SectionLabel } from '@/components/ui/card'
import { flowbitSupplier } from '@/lib/env'
import { SECURITY_CONTACT_NOTE, SECURITY_TOPICS } from '@/modules/marketing/content/security'
import { pageMetadata } from '@/modules/marketing/seo'

export const metadata = pageMetadata({
  title: 'Security',
  description: 'How Flowbit protects your workspace: two-factor sign-in, encryption, roles, audit logs, DPDP tools, export, deletion and hosting in Mumbai.',
  path: '/security',
})

/** The public security page: plain statements of what Flowbit does today. */
export default function SecurityPage() {
  const { supportEmail } = flowbitSupplier()
  return (
    <>
      <section className="relative isolate overflow-hidden px-4 pb-6 pt-16 text-center sm:px-6 sm:pt-20">
        <Mesh className="-z-10" intensity="soft" />
        <SectionLabel icon={<ShieldCheck strokeWidth={1.5} />} className="justify-center">Security</SectionLabel>
        <h1 className="mx-auto mt-4 max-w-3xl text-balance text-[40px] font-semibold leading-[1.08] text-white sm:text-[52px]">Your payroll and invoices, kept safe</h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-white/75">What Flowbit does to protect your workspace today, in plain words.</p>
      </section>
      <Section className="pt-10 sm:pt-12">
        <div className="grid gap-4 sm:grid-cols-2">
          {SECURITY_TOPICS.map((t) => (
            <section key={t.key} id={t.key} aria-labelledby={`${t.key}-title`} className="lit-edge scroll-mt-24 rounded-[14px] bg-white/[0.035] p-5">
              <h2 id={`${t.key}-title`} className="text-base font-semibold text-white">{t.title}</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/75">
                {t.points.map((p) => (
                  <li key={p} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-orchid" />{p}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-6 text-sm text-white/60">
          {SECURITY_CONTACT_NOTE} <a className="text-white underline-offset-4 hover:underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> · <Link className="text-white underline-offset-4 hover:underline" href="/legal/dpa">Data processing terms</Link> · <Link className="text-white underline-offset-4 hover:underline" href="/legal/privacy">Privacy policy</Link>
        </p>
      </Section>
      <CtaBand title="Start with a workspace that is yours alone." />
    </>
  )
}
