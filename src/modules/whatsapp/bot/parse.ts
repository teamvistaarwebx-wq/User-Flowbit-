import { addDays } from '@/lib/dates'

/**
 * The employee WhatsApp bot's reading of what someone typed (pure): a
 * command by keyword or menu number, in English or Hindi (Devanagari or
 * Hinglish), dates like "12 Oct", "12/10", "today", "कल", and yes / no.
 */

export const BOT_COMMANDS = ['checkin', 'checkout', 'balance', 'leave', 'payslip', 'menu', 'cancel'] as const
export type BotCommand = (typeof BOT_COMMANDS)[number]

export type Lang = 'en' | 'hi'

/** Hindi when the message has Devanagari letters; Hinglish keywords still answer in the language the person last used. */
export const detectLang = (text: string): Lang | null => (/[ऀ-ॿ]/.test(text) ? 'hi' : /[a-z]/i.test(text) ? 'en' : null)

/** Lower-case, Devanagari kept, punctuation and extra spaces gone. */
export const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const KEYWORDS: Readonly<Record<BotCommand, readonly string[]>> = {
  checkin: ['1', 'check in', 'checkin', 'check-in', 'punch in', 'in', 'start', 'start day', 'present', 'hazri', 'haziri', 'chek in', 'चेक इन', 'चेकइन', 'हाजिरी', 'हाज़िरी', 'हाज़री', 'हाजरी', 'आ गया', 'आ गई', 'पहुंच गया', 'पहुंच गई'],
  checkout: ['2', 'check out', 'checkout', 'check-out', 'punch out', 'out', 'end day', 'done for the day', 'chek out', 'चेक आउट', 'चेकआउट', 'जा रहा हूं', 'जा रही हूं', 'जा रहा हूँ', 'जा रही हूँ', 'निकल रहा', 'निकल रही'],
  balance: ['3', 'balance', 'leave balance', 'leaves', 'my leaves', 'chutti balance', 'chhutti balance', 'बैलेंस', 'छुट्टी बैलेंस', 'छुट्टियां', 'छुट्टियाँ', 'छुट्टी कितनी', 'बची छुट्टी'],
  leave: ['4', 'leave', 'apply leave', 'apply for leave', 'leave apply', 'chutti', 'chhutti', 'chutti chahiye', 'छुट्टी', 'छुट्टी चाहिए', 'अवकाश', 'छुट्टी लेनी है'],
  payslip: ['5', 'payslip', 'pay slip', 'salary slip', 'salary', 'payslip link', 'पेस्लिप', 'पे स्लिप', 'सैलरी स्लिप', 'वेतन पर्ची', 'सैलरी'],
  menu: ['0', 'menu', 'help', 'hi', 'hello', 'hey', 'options', 'मेनू', 'मदद', 'नमस्ते', 'हेलो', 'हाय'],
  // Not 'cancel' or 'stop': those opt the number out of WhatsApp (messaging/consent isStopKeyword).
  cancel: ['exit', 'quit', 'back', 'never mind', 'रद्द', 'रद्द करें', 'छोड़ो', 'वापस'],
}

const BY_PHRASE = new Map<string, BotCommand>(Object.entries(KEYWORDS).flatMap(([command, words]) => words.map((w) => [normalise(w), command as BotCommand])))

/** The command a whole message stands for, or null (anything else stays a normal chat for the inbox). */
export function parseCommand(text: string): BotCommand | null {
  return BY_PHRASE.get(normalise(text)) ?? null
}

const YES = ['yes', 'y', 'ok', 'okay', 'confirm', 'haan', 'han', 'ha', 'ji', 'haan ji', 'हां', 'हाँ', 'हा', 'जी', 'हाँ जी', 'ठीक है']
const NO = ['no', 'n', 'nahi', 'nahin', 'na', 'नहीं', 'ना', 'नही']

export function parseYesNo(text: string): boolean | null {
  const t = normalise(text)
  if (YES.map(normalise).includes(t)) return true
  if (NO.map(normalise).includes(t)) return false
  return null
}

export const isCancel = (text: string): boolean => parseCommand(text) === 'cancel'

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  जनवरी: 1, फरवरी: 2, मार्च: 3, अप्रैल: 4, मई: 5, जून: 6, जुलाई: 7, अगस्त: 8, सितंबर: 9, अक्टूबर: 10, नवंबर: 11, दिसंबर: 12,
}

const iso = (y: number, m: number, d: number): string | null => {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null
}

/** A day and month with no year: this year, or next year when that date has already passed. */
function nearestFuture(today: string, month: number, day: number): string | null {
  const year = Number(today.slice(0, 4))
  const thisYear = iso(year, month, day)
  if (!thisYear) return null
  return thisYear >= today ? thisYear : iso(year + 1, month, day)
}

/** A date from "today", "tomorrow", "आज", "कल", "12 Oct", "Oct 12", "12/10", "12-10-2026" or "2026-10-12" (IST calendar days). */
export function parseDate(text: string, today: string): string | null {
  const t = normalise(text)
  if (['today', 'aaj', 'आज'].includes(t)) return today
  if (['tomorrow', 'kal', 'कल'].includes(t)) return addDays(today, 1)
  if (['day after tomorrow', 'parso', 'परसों'].includes(t)) return addDays(today, 2)
  const isoMatch = /^(\d{4}) (\d{1,2}) (\d{1,2})$/.exec(t)
  if (isoMatch) return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
  const numeric = /^(\d{1,2}) (\d{1,2})(?: (\d{2,4}))?$/.exec(t)
  if (numeric) {
    const [, d, m, y] = numeric
    if (!y) return nearestFuture(today, Number(m), Number(d))
    return iso(y.length === 2 ? 2000 + Number(y) : Number(y), Number(m), Number(d))
  }
  const words = t.split(' ')
  const monthIndex = words.findIndex((w) => MONTHS[w.slice(0, 4)] || MONTHS[w.slice(0, 3)] || MONTHS[w])
  const dayWord = words.find((w) => /^\d{1,2}$/.test(w))
  if (monthIndex >= 0 && dayWord) {
    const word = words[monthIndex]
    const month = MONTHS[word] ?? MONTHS[word.slice(0, 4)] ?? MONTHS[word.slice(0, 3)]
    const year = words.find((w) => /^\d{4}$/.test(w))
    return year ? iso(Number(year), month, Number(dayWord)) : nearestFuture(today, month, Number(dayWord))
  }
  return null
}

/** A menu choice "2" or "2." among `count` options, as a 0-based index. */
export function parseChoice(text: string, count: number): number | null {
  const m = /^(\d{1,2})$/.exec(normalise(text))
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= count ? n - 1 : null
}
