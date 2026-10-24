/**
 * Demo Work structure for the seed (spaces, lists, projects, milestones).
 * People are referenced by role key or by the demo person's title; dates are
 * day offsets from the seed day so the demo always looks current.
 */

export type PersonRef = string

export const SEED_SPACES = [
  { name: 'Marketing', description: 'Campaigns, content and social for clients and for us.', color: '#F9A8D4', icon: 'megaphone', creator: 'admin', members: ['sales', 'Content Strategist', 'Performance Marketer'], folders: ['Campaigns', 'Content calendar', 'Social'] },
  { name: 'Engineering', description: 'Sprints, bugs and platform work.', color: '#818CF8', icon: 'code', creator: 'manager', members: ['member', 'Backend Developer', 'QA Engineer', 'Full-stack Developer'], folders: ['Sprint 41', 'Bugs', 'Platform'] },
  { name: 'Design', description: 'Brand systems and UI kits.', color: '#C084FC', icon: 'palette', creator: 'owner', members: ['UI/UX Designer', 'Graphic Designer'], folders: ['Brand', 'UI kits'] },
] as const

export type SeedProject = {
  key: string
  code: string
  name: string
  client?: string
  description: string
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  lead: PersonRef
  members: PersonRef[]
  start?: number
  end?: number
  color: string
  tags: string[]
  archived?: boolean
  milestones: { title: string; due: number; done?: boolean }[]
}

export const SEED_PROJECTS: SeedProject[] = [
  {
    key: 'web', code: 'WEB', name: 'Sharma Organics website revamp', client: 'Sharma Organics Pvt Ltd', color: '#5EEAB0', status: 'active',
    description: 'New D2C storefront with subscriptions, faster checkout and a recipe blog. Launch before the Diwali sale.',
    lead: 'manager', members: ['member', 'UI/UX Designer', 'Backend Developer', 'QA Engineer', 'Content Strategist'], start: -40, end: 20, tags: ['D2C', 'Shopify'],
    milestones: [{ title: 'Design sign-off', due: -12, done: true }, { title: 'Checkout live on staging', due: 4 }, { title: 'Diwali launch', due: 20 }],
  },
  {
    key: 'app', code: 'APP', name: 'Nimbus Fintech mobile app', client: 'Nimbus Fintech LLP', color: '#818CF8', status: 'active',
    description: 'React Native app for SIP tracking and UPI autopay mandates. Phase 1: onboarding, KYC and portfolio.',
    lead: 'manager', members: ['Full-stack Developer', 'Backend Developer', 'QA Engineer', 'UI/UX Designer'], start: -60, end: 45, tags: ['Mobile', 'Fintech'],
    milestones: [{ title: 'KYC flow approved by compliance', due: -5 }, { title: 'Beta on TestFlight', due: 14 }, { title: 'Play Store release', due: 45 }],
  },
  {
    key: 'seo', code: 'SEO', name: 'Urban Threads SEO retainer', client: 'Urban Threads Retail', color: '#F5B85C', status: 'active',
    description: 'Monthly SEO and content retainer: technical fixes, category pages and 8 blogs a month.',
    lead: 'admin', members: ['Performance Marketer', 'Content Strategist'], start: -90, end: 90, tags: ['Retainer', 'SEO'],
    milestones: [{ title: 'October content plan', due: 2 }, { title: 'Core Web Vitals pass', due: 25 }],
  },
  {
    key: 'brand', code: 'BRD', name: 'Coastal Spices brand refresh', client: 'Coastal Spices Exports', color: '#F0507A', status: 'active',
    description: 'New logo, packaging system and export catalogue for the Gulf and EU markets.',
    lead: 'owner', members: ['Graphic Designer', 'UI/UX Designer'], start: -30, end: -2, tags: ['Branding', 'Packaging'],
    milestones: [{ title: 'Logo routes presented', due: -18, done: true }, { title: 'Packaging artwork final', due: -2 }],
  },
  {
    key: 'ops', code: 'OPS', name: 'Internal ops and tooling', color: '#C084FC', status: 'planning',
    description: 'Move SOPs into Flowbit, set up time tracking and the client onboarding checklist.',
    lead: 'admin', members: ['hr_admin', 'finance', 'Project Coordinator'], tags: ['Internal'],
    milestones: [],
  },
  {
    key: 'school', code: 'GLS', name: 'Greenleaf Schools admissions site', client: 'Greenleaf Schools Trust', color: '#60A5FA', status: 'completed', archived: true,
    description: 'Admissions microsite with an enquiry form and fee calculator. Delivered in August.',
    lead: 'manager', members: ['member', 'UI/UX Designer'], start: -120, end: -50, tags: ['Education'],
    milestones: [{ title: 'Go live', due: -52, done: true }],
  },
]
