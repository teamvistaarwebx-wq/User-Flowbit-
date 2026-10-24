import { rupees } from '../pricing'
import { PLAN_PRICES } from '@/lib/plans'
import type { ProductContent } from './types'

export const ORBIT_CONTENT: ProductContent = {
  key: 'orbit',
  eyebrow: 'Sales pipeline',
  oneLiner: 'A pipeline that measures itself.',
  sub: 'Leads move through stages that mean something. Every call, email and reply is logged once, and conversion is worked out from that log instead of typed into a report.',
  heroMock: 'orbit-pipeline',
  features: [
    { icon: 'Target', title: 'Leads', body: 'Table and board by stage, with quick add. Source and sector on every lead, one owner and one reviewer, and a next action with a date.' },
    { icon: 'Layers', title: 'Stages with rules', body: 'New, Contacted, Engaged, Meeting booked, Meeting done, Proposal sent, then Won, or Lost or Disqualified with a reason. A lead moves one step at a time: Contacted needs a logged outreach, Engaged needs a logged reply.' },
    { icon: 'PhoneCall', title: 'Activities', body: 'Calls, emails, meetings, notes and follow-ups, with Today, Overdue and Upcoming lists so no follow-up slips.' },
    { icon: 'Kanban', title: 'Deals', body: 'A kanban by stage with values; drag to move. When a deal is won, turn it into a quote or invoice in Folio.' },
    { icon: 'Contact', title: 'Contacts and one client record', body: 'Everyone you talk to, linked to the company record your whole workspace shares.' },
    { icon: 'ChartLine', title: 'Reports', body: 'Cold vs warm conversion, by source, by owner, and won and lost reasons.' },
    { icon: 'Activity', title: 'Pipeline dashboard', body: 'Value by stage, won this month, conversion and follow-ups due today.' },
    { icon: 'Settings', title: 'Your own stages and lists', body: 'Set your stages, sources, lost reasons and sectors to match how you sell.' },
  ],
  spotlights: [
    {
      label: 'Lead timeline',
      icon: 'Activity',
      title: 'Every touch on one timeline',
      body: 'Log a call in two clicks, set the next follow-up, and see the whole history of a lead before you pick up the phone. Converting a lead creates the client and the deal together.',
      points: ['Calls, emails, meetings, notes and follow-ups', 'Next action and date on every lead', 'Convert to client and deal in one step'],
      mock: 'orbit-lead',
    },
    {
      label: 'Conversion',
      icon: 'ChartLine',
      title: 'Cold and warm conversion, counted not guessed',
      body: 'Cold conversion is meetings over leads contacted; warm is meetings over leads that replied. Both come from the activity log, by source and by owner.',
      points: ['Conversion by source and owner', 'Won and lost reasons', 'Pipeline value by stage'],
      mock: 'orbit-reports',
    },
  ],
  steps: [
    { title: 'Add or import leads', body: 'Source and sector on each; one owner, one reviewer.' },
    { title: 'Log every touch', body: 'Calls, emails and meetings move leads forward.' },
    { title: 'Work the follow-up list', body: 'Today, overdue and upcoming, every morning.' },
    { title: 'Win the deal', body: 'Drag it to Won and raise the quote or invoice in Folio.' },
  ],
  worksWith: [
    { title: 'Won deals become invoices', body: 'Create a quote or invoice in Folio from a won deal, with the client already filled in.', href: '/products/folio', product: 'folio' },
    { title: 'The client exists once', body: 'Converting a lead creates the shared client record that Work projects and Folio invoices use.', href: '/products/work', product: 'work' },
    { title: 'Search everything', body: 'Leads and deals show up in the workspace search and in Arc.', href: '/#arc', product: 'core' },
  ],
  notYet: ['A shared inbox for email and DMs', 'AI lead scoring'],
  plans: ['orbit'],
  pricingNote: 'A sales user is anyone who can work leads and deals. People who only view don’t count.',
  seo: {
    title: 'Orbit: a CRM pipeline that measures itself',
    description: `Leads, stages with rules, activities and follow-ups, a deal kanban and cold vs warm conversion reports. Won deals flow into Folio. ${rupees(PLAN_PRICES.orbit.monthlyPaise)} per sales user.`,
  },
}
