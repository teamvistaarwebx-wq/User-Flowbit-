import type { FaqItem } from './types'

/** Orbit: leads, deals, follow-ups, sequences, lead capture and shared clients. */
export const SALES_FAQ: readonly FaqItem[] = [
  {
    id: 'add-leads',
    category: 'sales',
    q: 'How do I add and track leads?',
    a: 'Add a lead with the company, the contact and where it came from, or import a CSV. Leads show as a table or a board, filtered by stage, source, sector, owner or next step. Log every call and email, schedule the next follow-up, and convert a lead into a client and a deal when it is ready.',
    guide: 'orbit#orbit-leads',
  },
  {
    id: 'lead-stages',
    category: 'sales',
    q: 'Can a lead skip stages?',
    a: 'No. A lead moves one step at a time (New, Contacted, Engaged, Meeting booked, Meeting done, Converted) and the evidence comes first: Contacted needs a logged outreach and Engaged needs a logged reply. That keeps the conversion reports honest.',
    guide: 'orbit#orbit-lead',
  },
  {
    id: 'deals-pipeline',
    category: 'sales',
    q: 'How do I manage deals?',
    a: 'Deals is a board: each column is a stage with its win probability, and you drag deals across. Won and lost deals need a reason. A won deal links to Folio, so you create the quote or invoice with the client already filled in.',
    guide: 'orbit#orbit-deals',
  },
  {
    id: 'sales-follow-ups',
    category: 'sales',
    q: 'Where do I see today’s follow-ups and sales reports?',
    a: 'Orbit opens on Today: what is overdue, due today and leads with no next step. Activities lists every call, email and meeting as today, overdue or upcoming. Reports show conversion, cold vs warm, sources, owners and won or lost reasons, with CSV.',
    guide: 'orbit#orbit-reports',
  },
  {
    id: 'sequences',
    category: 'sales',
    q: 'Does Orbit send follow-up emails for me?',
    a: 'Yes, with sequences: up to five steps of emails, call tasks, reminders and waits, sent Monday to Saturday in the hours you pick, with a daily limit per salesperson. Emails go from your own Gmail when you connect it, or from Flowbit with replies coming to you. A reply stops the sequence when Flowbit catches it at the reply address it adds, or when you log the reply or press Replied on the lead. A bounce, an unsubscribe or a conversion stops it too.',
    guide: 'whats-new#new-sequences',
  },
  {
    id: 'lead-capture',
    category: 'sales',
    q: 'Can leads come in from my website or other sites?',
    a: 'Yes. Orbit settings → Lead capture gives you a website form (or a script to embed), a webhook for Zapier, Meta lead ads and JustDial, and IndiaMART in beta. New leads go to a fixed owner or round-robin, and the owner is alerted at once.',
    guide: 'orbit#orbit-settings',
  },
  {
    id: 'shared-clients',
    category: 'sales',
    q: 'How do clients connect Work, Orbit and Folio?',
    a: 'There is one client record. Open a client to see its open pipeline, active projects and what it owes you, with tabs for contacts, projects, tasks, deals, invoices, the ledger and activity. Start a deal, project or invoice from there.',
    guide: 'whats-new#new-clients',
  },
  {
    id: 'sales-users',
    category: 'sales',
    q: 'Who counts as a sales user?',
    a: 'Anyone who can create or move leads and deals. People who only view Orbit do not count.',
  },
]
