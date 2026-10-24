import type { SeedCtx } from '@/lib/seed-types'
import { DemoRequest } from '@/models/marketing/DemoRequest'

const SEED_IP = 'seed'

/** A few demo requests from the website, so the platform admin has something to work with. Not workspace data. */
export async function seed(ctx: SeedCtx): Promise<void> {
  if (await DemoRequest.exists({ ip: SEED_IP })) {
    ctx.log('demo requests: already seeded')
    return
  }
  const docs = [
    { name: 'Meera Iyer', email: 'meera@kalpastudio.in', company: 'Kalpa Studio LLP', phone: '+91 98260 11223', teamSize: '11-50', products: ['work', 'folio'], message: 'We are a 24-person design studio. We want projects and GST invoices in one place and to stop chasing payments on WhatsApp.', status: 'new', createdAt: new Date('2026-09-30T10:42:00+05:30') },
    { name: 'Sandeep Kulkarni', email: 'sandeep.k@anantafoods.com', company: 'Ananta Foods Pvt Ltd', teamSize: '51-150', products: ['muster'], message: 'Around 90 people across two plants in Maharashtra. Payroll with PF, ESI and PT is in spreadsheets today. Can you show the payroll stages?', status: 'contacted', createdAt: new Date('2026-09-27T16:05:00+05:30') },
    { name: 'Neha Kapoor', email: 'neha@saffronthreads.co', company: 'Saffron Threads', phone: '+91 99300 44556', teamSize: '6-10', products: ['orbit', 'folio'], message: 'Small D2C brand. We get leads on Instagram and want a simple pipeline and invoices from two entities.', status: 'new', createdAt: new Date('2026-09-25T12:18:00+05:30') },
  ].map((d) => ({ ...d, ip: SEED_IP, userAgent: 'seed', updatedAt: d.createdAt }))
  await DemoRequest.insertMany(docs, { timestamps: false })
  ctx.log(`demo requests: ${docs.length}`)
}
