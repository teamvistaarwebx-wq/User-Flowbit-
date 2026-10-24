import { FREE_MONTHS, FREE_SEAT_LIMIT } from '@/lib/account-types'
import { TRIAL_DAYS } from '@/lib/plans'
import type { FaqItem } from './types'

/** Getting started: what Flowbit is, signing up and finding your way. */
export const GETTING_STARTED_FAQ: readonly FaqItem[] = [
  {
    id: 'what-is-flowbit',
    category: 'getting-started',
    q: 'What is Flowbit?',
    a: 'One workspace for the four things a growing Indian business runs on: Flowbit Work for tasks, projects and meetings, Muster for HR and payroll, Orbit for sales, and Folio for GST invoices and collections. They share one login and one client list, so nothing is typed twice.',
    guide: 'getting-started#start-what',
  },
  {
    id: 'sign-up',
    category: 'getting-started',
    q: 'How do I sign up and start?',
    a: `Open Sign up, enter your name, work email and a password (at least 8 characters with a letter and a number), and confirm the 6-digit code we email you. Then name your workspace, pick its web address and team size, invite people if you like, and choose project-based or personal. Teams of up to ${FREE_SEAT_LIMIT} start on Free for ${FREE_MONTHS} months; larger teams get a ${TRIAL_DAYS}-day trial of everything. No card is needed.`,
    guide: 'getting-started#start-signup',
  },
  {
    id: 'find-your-way',
    category: 'getting-started',
    q: 'How do I find my way around?',
    a: 'Home shows your day: your workday, Arc, what is in progress or overdue, and your tasks. The rail on the far left opens each product, the side panel next to it changes with the product, and Command K (or Search) jumps to any page, task, person or client.',
    guide: 'getting-started#start-layout',
  },
  {
    id: 'invite-team',
    category: 'getting-started',
    q: 'How do I invite my team?',
    a: 'Open Settings → Members, click Invite people, type their email addresses and pick a role for each. They get an email with a link to join. If email is not set up yet, copy the invite link and send it yourself. Resend, change roles or disable access from the actions menu.',
    guide: 'getting-started#start-invite',
  },
  {
    id: 'sample-data',
    category: 'getting-started',
    q: 'Can I try Flowbit with sample data first?',
    a: 'Yes. A new workspace can click Load sample agency to fill in clients, projects, tasks, leads, invoices and employees. Remove sample data deletes only those records, never yours. Owners and admins also get a Get started checklist and a short tour of each product.',
    guide: 'whats-new#new-get-started',
  },
  {
    id: 'several-workspaces',
    category: 'getting-started',
    q: 'Can one person belong to more than one workspace?',
    a: 'Yes. One login can join several workspaces, for example two companies you run. Switch between them from the workspace switcher in the side panel. Each workspace has its own products, people and data.',
  },
  {
    id: 'mobile-app',
    category: 'getting-started',
    q: 'Is there a mobile app?',
    a: 'Flowbit works in your phone’s browser, with touch-friendly boards, a quick check-in button and dialogs that open as bottom sheets. You can add it to your home screen like an app. It needs an internet connection; nothing works offline.',
  },
  {
    id: 'hindi',
    category: 'getting-started',
    q: 'Is Flowbit available in Hindi?',
    a: 'Partly. Each person can switch their own HR screens to Hindi in Settings → My account → Language: My HR, check-in and breaks, leave and payslips (the payslip PDF then has English and Hindi labels). The rest of Flowbit is in English. Quick add understands Hinglish dates and times everywhere.',
    guide: 'my-hr#me-language',
  },
  {
    id: 'setup-help',
    category: 'getting-started',
    q: 'Can the Flowbit team help us set up?',
    a: 'Yes. The owner can grant the Flowbit team read-only access for up to 72 hours, or import-only access for 7 days to load your data, from Settings → Support access. Every visit is logged. Flowbit staff never see salary, bank or PAN details: they stay masked for everyone on our team, admins included. Free setup is offered to yearly customers.',
    guide: 'settings#admin-support',
  },
  {
    id: 'book-demo',
    category: 'getting-started',
    q: 'Can I see a demo before signing up?',
    a: 'Yes. Book a demo from the Contact page and we will walk you through the products you care about. Or start the trial and load the sample agency to look around yourself.',
  },
]
