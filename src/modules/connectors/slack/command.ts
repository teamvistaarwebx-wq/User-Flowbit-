/** The /flowbit slash command: "task <text>", "my day", "help". Pure. */

export type SlashCommand = Readonly<{ kind: 'task'; text: string } | { kind: 'my_day' } | { kind: 'help' } | { kind: 'unknown'; text: string }>

export function parseSlashCommand(raw: string): SlashCommand {
  const text = raw.trim().replace(/\s+/g, ' ')
  const lower = text.toLowerCase()
  if (!text || lower === 'help' || lower === '?') return { kind: 'help' }
  if (/^(my ?day|today|aaj|mera din)$/.test(lower)) return { kind: 'my_day' }
  const task = /^(task|add|todo|new)\s+(.+)$/i.exec(text)
  if (task) return { kind: 'task', text: task[2].trim() }
  return { kind: 'unknown', text }
}

export const SLASH_HELP = [
  '*Flowbit in Slack*',
  '`/flowbit task logo bhejo kal 5 baje @vikram #design !acme p1`: creates a task (Hinglish dates, @person, #project or list, !client, p1–p4)',
  '`/flowbit my day`: your tasks due today, overdue and blocked',
  'Message menu → *Create Flowbit task*: turn any message into a task',
].join('\n')

/** "Slack #design" for the task timeline. */
export const slackLabel = (channelName: string | null | undefined) => (channelName ? `Slack #${channelName.replace(/^#/, '')}` : 'Slack')
