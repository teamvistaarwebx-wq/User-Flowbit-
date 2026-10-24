import type { TaskPriority, TaskStatus } from './constants'

/**
 * Demo tasks for the seed. `due` is a day offset from the seed day; `doneAgo`
 * and `startedAgo` are days back (they drive Home sparklines and reports).
 * `where` is [space, list]; `project` is a key from projects/seed-data.
 */
export type SeedTask = {
  title: string
  status: TaskStatus
  priority: TaskPriority
  who: string[]
  due?: number
  start?: number
  project?: string
  where?: [string, string]
  tags?: string[]
  estimate?: number
  doneAgo?: number
  startedAgo?: number
  blocked?: string
  milestone?: string
  checklist?: [string, boolean][]
  subtasks?: { title: string; status: TaskStatus; who: string }[]
  description?: string
}

export const SEED_TASKS: SeedTask[] = [
  // Sharma Organics website
  { title: 'Homepage copy for Diwali hero', status: 'in_progress', priority: 'high', who: ['Content Strategist'], due: 2, project: 'web', where: ['Marketing', 'Content calendar'], tags: ['copy'], estimate: 240, startedAgo: 3, milestone: 'Diwali launch', description: 'Hero headline, three benefit lines and the offer strip. Tone: warm, festive, no discount shouting.', checklist: [['Draft three headline options', true], ['Review with client', false], ['Final copy in Figma', false]] },
  { title: 'Subscription checkout on Shopify', status: 'in_progress', priority: 'urgent', who: ['Backend Developer', 'member'], due: 4, start: -6, project: 'web', where: ['Engineering', 'Sprint 41'], tags: ['checkout'], estimate: 960, startedAgo: 6, milestone: 'Checkout live on staging', subtasks: [{ title: 'Recharge app setup', status: 'done', who: 'Backend Developer' }, { title: 'Cart drawer upsell', status: 'in_progress', who: 'member' }, { title: 'UPI autopay test cases', status: 'todo', who: 'QA Engineer' }] },
  { title: 'Product page template', status: 'in_review', priority: 'high', who: ['member'], due: 1, project: 'web', where: ['Engineering', 'Sprint 41'], estimate: 480, startedAgo: 5 },
  { title: 'Recipe blog layout', status: 'todo', priority: 'medium', who: ['UI/UX Designer'], due: 6, project: 'web', where: ['Design', 'UI kits'], estimate: 300 },
  { title: 'Migrate 140 products with variants', status: 'blocked', priority: 'high', who: ['Backend Developer'], due: -1, project: 'web', tags: ['data'], estimate: 600, startedAgo: 4, blocked: 'Waiting for the final SKU sheet from Sharma Organics' },
  { title: 'Cross-browser QA pass', status: 'todo', priority: 'medium', who: ['QA Engineer'], due: 9, project: 'web', estimate: 480 },
  { title: 'Approve moodboard and type scale', status: 'done', priority: 'medium', who: ['UI/UX Designer'], due: -14, project: 'web', doneAgo: 12, startedAgo: 16, milestone: 'Design sign-off' },
  { title: 'Wireframes for 8 key pages', status: 'done', priority: 'high', who: ['UI/UX Designer'], due: -20, project: 'web', doneAgo: 13, startedAgo: 22, milestone: 'Design sign-off' },
  { title: 'Set up GA4 and Meta pixel', status: 'done', priority: 'low', who: ['Performance Marketer'], due: -6, project: 'web', doneAgo: 5, startedAgo: 6 },
  { title: 'Shipping rules for Indore and metros', status: 'todo', priority: 'medium', who: ['member'], due: -3, project: 'web', estimate: 120 },
  // Nimbus Fintech app
  { title: 'Aadhaar OTP KYC screens', status: 'in_review', priority: 'urgent', who: ['Full-stack Developer'], due: -2, project: 'app', where: ['Engineering', 'Sprint 41'], estimate: 900, startedAgo: 9, milestone: 'KYC flow approved by compliance' },
  { title: 'Portfolio dashboard charts', status: 'in_progress', priority: 'high', who: ['Full-stack Developer', 'UI/UX Designer'], due: 8, project: 'app', estimate: 720, startedAgo: 2 },
  { title: 'UPI autopay mandate API', status: 'in_progress', priority: 'high', who: ['Backend Developer'], due: 6, project: 'app', where: ['Engineering', 'Platform'], estimate: 960, startedAgo: 7 },
  { title: 'Crash on Android 11 when opening SIP detail', status: 'todo', priority: 'urgent', who: ['Full-stack Developer'], due: 0, project: 'app', where: ['Engineering', 'Bugs'], tags: ['bug', 'android'], estimate: 180 },
  { title: 'Compliance review of risk disclosures', status: 'blocked', priority: 'high', who: ['manager'], due: -4, project: 'app', blocked: 'Nimbus legal team is reviewing the disclosure text', startedAgo: 8, milestone: 'KYC flow approved by compliance' },
  { title: 'Onboarding illustrations', status: 'done', priority: 'medium', who: ['UI/UX Designer'], due: -9, project: 'app', doneAgo: 8, startedAgo: 12 },
  { title: 'Push notification service', status: 'done', priority: 'medium', who: ['Backend Developer'], due: -7, project: 'app', doneAgo: 6, startedAgo: 10 },
  { title: 'TestFlight build pipeline', status: 'todo', priority: 'medium', who: ['QA Engineer'], due: 11, project: 'app', milestone: 'Beta on TestFlight', estimate: 360 },
  { title: 'Regression suite for login and KYC', status: 'done', priority: 'high', who: ['QA Engineer'], due: -3, project: 'app', doneAgo: 2, startedAgo: 5 },
  { title: 'Biometric login', status: 'todo', priority: 'low', who: ['Full-stack Developer'], due: 20, project: 'app', estimate: 480 },
  // Urban Threads SEO
  { title: 'October blog: festive ethnic wear guide', status: 'in_progress', priority: 'medium', who: ['Content Strategist'], due: 3, project: 'seo', where: ['Marketing', 'Content calendar'], tags: ['blog'], estimate: 240, startedAgo: 1, milestone: 'October content plan' },
  { title: 'Fix 312 broken internal links', status: 'done', priority: 'high', who: ['Performance Marketer'], due: -8, project: 'seo', doneAgo: 7, startedAgo: 9 },
  { title: 'Category page meta for kurtas and sarees', status: 'done', priority: 'medium', who: ['Content Strategist'], due: -4, project: 'seo', doneAgo: 3, startedAgo: 4 },
  { title: 'Image compression on PLPs', status: 'in_review', priority: 'medium', who: ['Performance Marketer'], due: 5, project: 'seo', startedAgo: 3, milestone: 'Core Web Vitals pass' },
  { title: 'Monthly SEO report for September', status: 'todo', priority: 'high', who: ['admin'], due: -1, project: 'seo', tags: ['report'], estimate: 120 },
  { title: 'Keyword map for winter collection', status: 'todo', priority: 'low', who: ['Performance Marketer'], due: 14, project: 'seo' },
  // Coastal Spices brand
  { title: 'Packaging dieline for 200 g pouch', status: 'in_progress', priority: 'urgent', who: ['Graphic Designer'], due: -2, project: 'brand', where: ['Design', 'Brand'], startedAgo: 6, milestone: 'Packaging artwork final', estimate: 480 },
  { title: 'Export catalogue in Arabic and English', status: 'blocked', priority: 'high', who: ['Graphic Designer'], due: -5, project: 'brand', blocked: 'Arabic translation not received from the client', startedAgo: 10 },
  { title: 'Logo routes A, B and C', status: 'done', priority: 'high', who: ['owner', 'Graphic Designer'], due: -18, project: 'brand', doneAgo: 17, startedAgo: 25, milestone: 'Logo routes presented' },
  { title: 'Colour palette for spice families', status: 'done', priority: 'medium', who: ['UI/UX Designer'], due: -10, project: 'brand', doneAgo: 9, startedAgo: 12 },
  { title: 'Print vendor quotes', status: 'todo', priority: 'medium', who: ['owner'], due: 3, project: 'brand', estimate: 60 },
  // Internal ops
  { title: 'Write client onboarding checklist', status: 'todo', priority: 'medium', who: ['Project Coordinator'], due: 7, project: 'ops', where: ['Marketing', 'Campaigns'] },
  { title: 'Move SOPs from Google Docs', status: 'in_progress', priority: 'low', who: ['hr_admin'], due: 12, project: 'ops', startedAgo: 2 },
  { title: 'Set timesheet rules for retainers', status: 'todo', priority: 'medium', who: ['finance'], due: 10, project: 'ops' },
  // Greenleaf (archived, all done)
  { title: 'Admissions enquiry form', status: 'done', priority: 'high', who: ['member'], due: -60, project: 'school', doneAgo: 58, startedAgo: 70 },
  { title: 'Fee calculator', status: 'done', priority: 'medium', who: ['member'], due: -56, project: 'school', doneAgo: 55, startedAgo: 62 },
  { title: 'Microsite design', status: 'done', priority: 'medium', who: ['UI/UX Designer'], due: -75, project: 'school', doneAgo: 74, startedAgo: 85 },
  // Space work without a project
  { title: 'Instagram carousel: 5 Diwali gifting ideas', status: 'todo', priority: 'medium', who: ['Content Strategist'], due: 5, where: ['Marketing', 'Social'], tags: ['social'] },
  { title: 'LinkedIn post on our new website case study', status: 'in_review', priority: 'low', who: ['sales'], due: 2, where: ['Marketing', 'Social'], startedAgo: 1 },
  { title: 'Upgrade Node to 22 on build servers', status: 'todo', priority: 'medium', who: ['Backend Developer'], due: 15, where: ['Engineering', 'Platform'], tags: ['devops'] },
  { title: 'Flaky e2e test on payments', status: 'in_progress', priority: 'high', who: ['QA Engineer'], due: 1, where: ['Engineering', 'Bugs'], tags: ['bug'], startedAgo: 2 },
  { title: 'Icon set refresh', status: 'done', priority: 'low', who: ['Graphic Designer'], due: -2, where: ['Design', 'UI kits'], doneAgo: 1, startedAgo: 4 },
  { title: 'Q3 sales deck refresh', status: 'todo', priority: 'medium', who: ['sales'], due: 8, tags: ['sales'] },
  { title: 'Review vendor contracts for renewal', status: 'todo', priority: 'medium', who: ['finance'], due: 6 },
  { title: 'Plan Diwali team lunch', status: 'done', priority: 'low', who: ['hr_exec'], due: -1, doneAgo: 0, startedAgo: 2 },
  { title: 'Weekly delivery review notes', status: 'done', priority: 'medium', who: ['manager'], due: -7, doneAgo: 7, startedAgo: 7 },
  { title: 'Hiring plan for two frontend roles', status: 'in_progress', priority: 'high', who: ['owner', 'hr_admin'], due: 4, startedAgo: 3 },
]

/** Private to-dos (Personal view) for the owner and the member. */
export const SEED_PERSONAL: { who: string; title: string; due?: number; status: TaskStatus; doneAgo?: number }[] = [
  { who: 'owner', title: 'Call CA about advance tax instalment', due: 0, status: 'todo' },
  { who: 'owner', title: 'Read Shape Up chapters 3–5', due: 5, status: 'in_progress' },
  { who: 'owner', title: 'Renew domain for vistaarsws.com', due: -2, status: 'todo' },
  { who: 'owner', title: 'Book flights for Bengaluru client visit', status: 'done', doneAgo: 1 },
  { who: 'member', title: 'Finish TypeScript generics course', due: 7, status: 'in_progress' },
  { who: 'member', title: 'Update portfolio with Greenleaf project', due: 3, status: 'todo' },
]

/** Comments: task title, author ref, body (`@{ref}` becomes an @mention of that person), optional reply. */
export const SEED_COMMENTS: { task: string; by: string; body: string; reply?: { by: string; body: string } }[] = [
  { task: 'Subscription checkout on Shopify', by: 'manager', body: '@{member} can we demo the cart drawer to the client on Friday?', reply: { by: 'member', body: 'Yes, staging will have it by Thursday evening.' } },
  { task: 'Migrate 140 products with variants', by: 'Backend Developer', body: 'Script is ready, just need the final SKU sheet. @{manager} could you nudge the client?' },
  { task: 'Aadhaar OTP KYC screens', by: 'QA Engineer', body: 'Found an edge case: OTP resend timer resets when the app goes to background.', reply: { by: 'Full-stack Developer', body: 'Fixed in build 0.9.4, please retest.' } },
  { task: 'Homepage copy for Diwali hero', by: 'admin', body: 'Love option 2. Keep "farm to kitchen" in the subhead.' },
  { task: 'Export catalogue in Arabic and English', by: 'owner', body: '@{sales} please follow up with Coastal Spices on the translation, we are blocked.' },
  { task: 'Packaging dieline for 200 g pouch', by: 'Graphic Designer', body: 'Printer needs 3 mm bleed on all sides, updating the dieline now.' },
]
