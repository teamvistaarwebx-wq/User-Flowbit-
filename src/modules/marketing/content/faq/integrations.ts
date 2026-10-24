import { MCP_LIMITS } from '@/modules/mcp/limits'
import type { FaqItem } from './types'

/** Arc, AI apps (MCP), Google, Slack, webhooks, email to task and WhatsApp. */
export const INTEGRATIONS_FAQ: readonly FaqItem[] = [
  {
    id: 'what-is-arc',
    category: 'integrations',
    q: 'What can Arc, the AI assistant, do?',
    a: 'Ask Arc about your workspace in plain words and it finds the tasks, clients and posts you mean. It can also outline a project, break a big task into steps, or write a progress update from real activity.',
    guide: 'work#work-arc',
  },
  {
    id: 'arc-changes',
    category: 'integrations',
    q: 'Will Arc change my data?',
    a: 'No. AI reads, people decide. Arc drafts; nothing is created or changed until you click Apply. Salary, bank and PAN details are stripped out before anything is sent to the AI.',
    guide: 'whats-new#new-arc',
  },
  {
    id: 'arc-limits',
    category: 'integrations',
    q: 'How many AI requests do I get?',
    a: 'Each plan has a monthly allowance: none on Free, 50 during a trial and 500 a month on paid plans by default. Settings → Integrations shows how many you have used. Past the limit Arc keeps working with its built-in templates.',
    guide: 'whats-new#new-arc',
  },
  {
    id: 'connect-claude-chatgpt',
    category: 'integrations',
    q: 'Can I use Flowbit from Claude or ChatGPT?',
    a: 'Yes. Flowbit has an MCP server. Copy the connection URL from Settings → Connected apps, add it as a custom connector in Claude or ChatGPT, sign in and approve what it may do. Then ask it to add tasks from meeting notes, list today’s follow-ups or review overdue invoices. Available on paid plans and during a trial.',
    guide: 'settings#admin-connected-apps',
  },
  {
    id: 'ai-app-limits',
    category: 'integrations',
    q: 'What can a connected AI app do in my workspace?',
    a: `Only what your role allows, within the scopes you approved. It can never touch attendance, payroll or salaries, issue or void invoices, record payments, delete anything, or change roles, settings or billing, and it never sees salary, PAN or bank details. Every change is logged as “you via Claude” and can be undone for 7 days. Limits: ${MCP_LIMITS.requestsPerMinute} requests a minute, ${MCP_LIMITS.maxChangesPerApply} changes in one go and ${MCP_LIMITS.dailyWritesPerWorkspace} changes a day per workspace.`,
    guide: 'settings#admin-connected-apps',
  },
  {
    id: 'google-calendar',
    category: 'integrations',
    q: 'Does Flowbit work with Google Calendar and Meet?',
    a: 'Yes. Each person connects their own Google Calendar in Settings → Google (in the Personal group). Meetings you schedule in Work go on your calendar with a Google Meet link, and moving or cancelling them in Flowbit updates Google. Your own Google events show, read-only, on the Meetings calendar.',
    guide: 'whats-new#new-google',
  },
  {
    id: 'slack',
    category: 'integrations',
    q: 'Does Flowbit work with Slack?',
    a: 'Yes. Once an admin adds the Flowbit app to Slack, type /flowbit task with a task in plain words or Hinglish, /flowbit my day for what is due, or turn any message into a task from its menu. Slack users act as themselves, matched by email.',
    guide: 'settings#admin-slack',
  },
  {
    id: 'webhooks',
    category: 'integrations',
    q: 'Can I connect Flowbit to Zapier or Make?',
    a: 'Yes, with webhooks. Settings → Integrations → Webhooks sends task created or completed, lead created, deal won, invoice issued and invoice paid to any URL, signed so your server can check it, and retried if it fails.',
    guide: 'settings#admin-webhooks',
  },
  {
    id: 'email-to-task',
    category: 'integrations',
    q: 'Can I turn an email into a task?',
    a: 'Yes. Forward or send it to your private tasks+ address (shown in Settings → My account). The subject becomes the title, the body the description, and attachments are added. Only mail from your own address is accepted, unless an admin turns on "Allow teammates to email my address" in Settings → Security. Mail that fails SPF, DKIM or DMARC is refused. When a mail is refused, you get a notice in Flowbit saying why.',
    guide: 'settings#admin-email-task',
  },
  {
    id: 'whatsapp',
    category: 'integrations',
    q: 'Does Flowbit work with WhatsApp?',
    a: 'WhatsApp messages from your own business number are coming soon. Today, alerts, reminders and documents go in the app and by email.',
  },
]
