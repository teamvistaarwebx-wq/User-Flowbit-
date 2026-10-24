import { GitCompareArrows, ListChecks, ShieldCheck } from 'lucide-react'
import { CtaBand } from '@/components/marketing/cta-band'
import { Mesh } from '@/components/marketing/mesh'
import { Section } from '@/components/marketing/section'
import { SectionLabel } from '@/components/ui/card'
import { COMPARE_STATS, COUNTED_ON, ENGINEERING, V2_ADDED, type CompareGroup } from '@/modules/marketing/content/compare'
import { pageMetadata } from '@/modules/marketing/seo'

export const metadata = pageMetadata({
  title: 'Flowbit 1 and 2',
  description: 'What changed from Flowbit 1 to Flowbit 2: the numbers, counted in the code, and the features added.',
  path: '/compare-v1-v2',
})

function Groups({ groups }: { groups: readonly CompareGroup[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <div key={g.title} className="lit-edge rounded-[14px] bg-white/[0.035] p-5">
          <h3 className="text-base font-semibold text-white">{g.title}</h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/75">
            {g.items.map((i) => (
              <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-orchid" />{i}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** Flowbit 1 against Flowbit 2: counted numbers, what was added, and how the code is checked. */
export default function CompareV1V2Page() {
  return (
    <>
      <section className="relative isolate overflow-hidden px-4 pb-6 pt-16 text-center sm:px-6 sm:pt-20">
        <Mesh className="-z-10" intensity="soft" />
        <SectionLabel icon={<GitCompareArrows strokeWidth={1.5} />} className="justify-center">Flowbit 1 and 2</SectionLabel>
        <h1 className="mx-auto mt-4 max-w-3xl text-balance text-[40px] font-semibold leading-[1.08] text-white sm:text-[52px]">What two releases changed</h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-white/75">Flowbit 2 kept the four products and added a back office, automations, client-facing documents and a lot of India-specific depth. Here is the difference, counted in the code.</p>
      </section>

      <Section className="pt-10 sm:pt-12">
        <div className="overflow-x-auto rounded-[14px] lit-edge bg-white/[0.035]">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.1] text-white/70">
                <th className="px-5 py-3 font-normal">Counted</th>
                <th className="px-5 py-3 text-right font-normal">Flowbit 1</th>
                <th className="px-5 py-3 text-right font-normal">Flowbit 2</th>
                <th className="hidden px-5 py-3 font-normal md:table-cell">How</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_STATS.map((s) => (
                <tr key={s.label} className="border-b border-white/[0.06] last:border-0">
                  <th scope="row" className="px-5 py-3 font-medium text-white">{s.label}</th>
                  <td className="px-5 py-3 text-right tabular-nums text-white/70">{s.v1}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-white">{s.v2}</td>
                  <td className="hidden px-5 py-3 text-[13px] text-white/60 md:table-cell">{s.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-white/50">Counted on {COUNTED_ON} against the Flowbit 1 baseline of 7 Oct 2026.</p>
      </Section>

      <Section label="Added in Flowbit 2" icon={<ListChecks />} title="Added in Flowbit 2" description="Grouped by who it helps. Everything listed is in the product today.">
        <Groups groups={V2_ADDED} />
      </Section>

      <Section label="How it is built" icon={<ShieldCheck />} title="How it is built" description="Software that runs payroll and invoices has to be dependable. These checks run on every change.">
        <Groups groups={ENGINEERING} />
      </Section>

      <CtaBand title="See Flowbit 2 for yourself." />
    </>
  )
}
