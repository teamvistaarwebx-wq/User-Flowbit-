import type { ExpenseMode } from '@/modules/folio/expenses/rules'

/**
 * A bank debit as an expense (pure): the category a narration suggests (by
 * the default category names, matched to the workspace's own list), the
 * payment mode and a readable payee. Only a suggestion; the person picks.
 */

/** In order: the first rule that matches wins (Google Ads is marketing before Google is software). */
const RULES: readonly (readonly [RegExp, string])[] = [
  [/\b(google ?ads|adwords|facebk|facebook|fb ?ads|meta ?ads|meta platforms|instagram|linkedin|twitter|youtube ads)\b/i, 'Marketing'],
  [/\b(rent|lease|landlord)\b/i, 'Rent'],
  [/\b(salary|salaries|sal|payroll|wages|stipend)\b/i, 'Salaries & wages'],
  [/\b(gst ?pmt|gstn|gst payment|tds|cbdt|income ?tax|advance tax|epfo|esic|pf contribution|professional tax|challan|mca|roc|ptax)\b/i, 'Taxes & fees'],
  [/\b(charges|chrg|chgs|sms ?alert|annual fee|min bal|amc|debit card fee|imps chg|neft chg)\b/i, 'Bank charges'],
  [/\b(aws|amazon web|google|gsuite|workspace|microsoft|msft|adobe|github|figma|notion|slack|zoom|canva|atlassian|jira|openai|anthropic|vercel|digitalocean|godaddy|hostinger|netlify|cloudflare|shopify|subscription|saas)\b/i, 'Software & subscriptions'],
  [/\b(uber|ola|rapido|irctc|indigo|air ?india|vistara|akasa|spicejet|makemytrip|mmt|goibibo|redbus|cleartrip|ixigo|petrol|diesel|fuel|hpcl|iocl|bpcl|fastag|toll|hotel|oyo)\b/i, 'Travel'],
  [/\b(freelanc\w*|creator|influencer|consultant fee|retainer)\b/i, 'Creator/freelancer payments'],
  [/\b(ca|chartered|legal|advocate|lawyer|consulting|audit|auditor|notary|trademark)\b/i, 'Professional fees'],
  [/\b(electricity|bescom|msedcl|tpddl|bses|tata ?power|adani ?elec\w*|airtel|jio|vodafone|vi|bsnl|act ?fibernet|broadband|internet|water|swiggy|zomato|blinkit|zepto|instamart|stationery|office|courier|bluedart|delhivery|dunzo|amazon|flipkart|housekeeping)\b/i, 'Office & utilities'],
]

export type CategoryOption = Readonly<{ id: string; name: string }>

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The workspace category the narration points to, else "Other" when the workspace has it, else null. */
export function suggestCategory(narration: string, categories: readonly CategoryOption[]): CategoryOption | null {
  const rule = RULES.find(([pattern]) => pattern.test(narration))
  const named = rule ? categories.find((c) => same(c.name, rule[1])) : undefined
  return named ?? categories.find((c) => same(c.name, 'Other')) ?? null
}

/** How the money left, read from the narration's channel. */
export function modeOf(narration: string): ExpenseMode {
  const text = narration.toUpperCase()
  if (/\bUPI\b|UPI\//.test(text)) return 'upi'
  if (/\b(N?ACH|ECS|SI|AUTOPAY|E-?MANDATE)\b/.test(text)) return 'auto_debit'
  if (/\b(POS|CARD|VPS|ECOM)\b/.test(text)) return 'card'
  if (/\b(CHQ|CHEQUE|CLG|CLEARING)\b/.test(text)) return 'cheque'
  if (/\b(NEFT|RTGS|IMPS|IFT|FT|TRF|TRANSFER)\b/.test(text)) return 'bank_transfer'
  return 'other'
}

const CHANNEL_WORDS = new Set(['UPI', 'NEFT', 'RTGS', 'IMPS', 'DR', 'CR', 'TO', 'BY', 'TRF', 'TRANSFER', 'POS', 'ACH', 'NACH', 'ECS', 'MB', 'IB', 'INB', 'FT', 'IFT', 'PAYMENT', 'P2A', 'P2M', 'SENT', 'RECEIVED', 'REF', 'NO', 'ONLINE', 'BIL', 'BILLPAY', 'INF', 'MOB', 'CMS', 'DEBIT', 'CREDIT'])

const titleCase = (text: string) => text.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())

/** A readable payee or payer from a narration ("UPI/412345678901/SHARMA PRINTERS/okaxis" → "Sharma Printers"). */
export function payeeOf(narration: string): string {
  const pieces = narration
    .split(/[/\-:|*]+/)
    .map((p) => p.split(/\s+/).filter((w) => w && !CHANNEL_WORDS.has(w.toUpperCase())).join(' '))
    .filter(Boolean)
  const name = pieces.find((p) => {
    if (p.includes('@')) return false
    if (/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(p)) return false
    const letters = (p.match(/[A-Za-z]/g) ?? []).length
    const digits = (p.match(/\d/g) ?? []).length
    return letters >= 3 && digits <= letters / 2 && !/^OK[A-Z]+$/i.test(p)
  })
  const picked = (name ?? narration).replace(/\s+/g, ' ').trim()
  return titleCase(picked).slice(0, 60) || 'Bank payment'
}
