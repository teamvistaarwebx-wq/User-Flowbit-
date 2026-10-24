import { CalendarDays, Mail, MapPin, MessagesSquare, MonitorPlay } from 'lucide-react'
import { ContactForm } from '@/components/marketing/contact-form'
import { Mesh } from '@/components/marketing/mesh'
import { SectionLabel } from '@/components/ui/card'
import { flowbitSupplier } from '@/lib/env'
import { pageMetadata } from '@/modules/marketing/seo'
import { START_FREE_NOTE } from '@/modules/marketing/start-free'

export const metadata = pageMetadata({
  title: 'Book a demo',
  description: 'Tell us about your team and we will walk you through Flowbit Work, Muster, Orbit and Folio with your own use case.',
  path: '/contact',
})

const NEXT_STEPS = [
  { icon: MessagesSquare, title: 'We read your note', body: 'Someone from the Flowbit team, not a bot, replies by email.' },
  { icon: CalendarDays, title: 'We pick a time', body: 'A 30-minute call in IST that suits you.' },
  { icon: MonitorPlay, title: 'We show your use case', body: 'Payroll, GST invoices, a pipeline or projects: whatever you need to see.' },
]

export default function ContactPage() {
  const supplier = flowbitSupplier()
  return (
    <section className="relative isolate overflow-hidden px-4 pb-24 pt-14 sm:px-6 sm:pt-20">
      <Mesh className="-z-10" intensity="soft" />
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <SectionLabel icon={<CalendarDays strokeWidth={1.5} />}>Book a demo</SectionLabel>
          <h1 className="mt-4 text-balance text-[40px] font-semibold leading-[1.08] text-white sm:text-[52px]">
            See Flowbit with your team’s work
          </h1>
          <p className="mt-5 max-w-lg text-pretty text-lg leading-relaxed text-white/75">
            Tell us a little about your team and what you want to see. Prefer to explore alone? Start free: {START_FREE_NOTE.toLowerCase()}.
          </p>
          <ol className="mt-10 border-t border-line/70">
            {NEXT_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 border-b border-line/70 py-4">
                <s.icon className="mt-0.5 size-5 shrink-0 text-white/80" strokeWidth={1.5} aria-hidden />
                <span>
                  <span className="block text-sm font-medium text-white"><span className="mr-1.5 tabular-nums text-[#979797]">{String(i + 1).padStart(2, '0')}</span>{s.title}</span>
                  <span className="mt-0.5 block text-sm text-white/70">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-8 grid gap-3 text-sm">
            <p className="flex items-center gap-3 text-white/75">
              <Mail className="size-4 text-icon-muted" strokeWidth={1.5} aria-hidden />
              <a href={`mailto:${supplier.supportEmail}`} className="text-white hover:text-link">{supplier.supportEmail}</a>
            </p>
            {supplier.address ? (
              <p className="flex items-start gap-3 text-white/75">
                <MapPin className="mt-0.5 size-4 shrink-0 text-icon-muted" strokeWidth={1.5} aria-hidden />
                <span>{supplier.legalName}, {supplier.address}</span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="min-w-0">
          <ContactForm />
        </div>
      </div>
    </section>
  )
}
