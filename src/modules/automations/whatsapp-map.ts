import { buttonSuffix, type CustomerTemplateKey } from '@/modules/whatsapp/customer-templates'
import type { WaExtras } from '@/modules/whatsapp/templates'
import { invoicePaidPayload, quoteAcceptPayload } from '@/modules/actionlinks/token'
import type { Vars } from './types'

/**
 * Which approved WhatsApp B template an automation's client message uses
 * (pure). A recipe without one still runs: the message goes by email. The
 * values come from the run's variables; the PDF header and the URL button
 * from its public document link.
 */

export type AutomationTemplate = Readonly<{ key: CustomerTemplateKey; values: Record<string, string>; extras: WaExtras }>

const str = (v: Vars[string] | undefined): string => (v == null ? '' : String(v))

/** The public link's PDF and the button suffix ('d/<token>'), or null when the link is not Flowbit's. */
function linkExtras(link: string, fileName: string, appBase: string, payload?: (token: string) => string): WaExtras | null {
  const suffix = buttonSuffix(link, appBase)
  const token = link.split('/d/')[1]
  return suffix ? { headerUrl: `${link}/pdf`, fileName, buttonValue: suffix, ...(payload && token ? { payloads: [payload(token)] } : {}) } : null
}

const pdfName = (label: string, number: string) => `${label}-${number.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`

export function automationTemplate(recipeKey: string | null | undefined, vars: Vars, appBase: string, today: string): AutomationTemplate | null {
  const name = str(vars.client_name) || 'there'
  const business = str(vars.business_name)
  switch (recipeKey) {
    case 'payment_thank_you':
    case 'part_payment_ack': {
      const extras = linkExtras(str(vars.receipt_link), pdfName('Receipt', str(vars.receipt_number)), appBase)
      return extras ? { key: 'receipt_thanks', values: { name, business, amount: str(vars.amount), number: str(vars.invoice_number) }, extras } : null
    }
    case 'invoice_send': {
      const extras = linkExtras(str(vars.document_link), pdfName('Invoice', str(vars.invoice_number)), appBase, invoicePaidPayload)
      return extras ? { key: 'invoice_share', values: { name, business, number: str(vars.invoice_number), amount: str(vars.invoice_total), dueDate: str(vars.due_date) }, extras } : null
    }
    case 'quote_follow_up':
    case 'quote_expiring': {
      const extras = linkExtras(str(vars.document_link), pdfName('Quote', str(vars.quote_number)), appBase, quoteAcceptPayload)
      return extras ? { key: 'quote_share', values: { name, business, number: str(vars.quote_number), amount: str(vars.quote_total), validUntil: str(vars.valid_until) }, extras } : null
    }
    case 'monthly_statement': {
      const extras = linkExtras(str(vars.statement_link), pdfName('Statement', today), appBase)
      return extras ? { key: 'statement', values: { name, business, amount: str(vars.total_due), date: today }, extras } : null
    }
    default:
      return null
  }
}
