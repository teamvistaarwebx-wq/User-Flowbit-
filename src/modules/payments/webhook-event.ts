/**
 * The parts of a Razorpay `payment_link.paid` webhook Flowbit uses (pure).
 * Anything malformed is null: the route answers 200 and ignores it.
 */

export type PaidLinkEvent = Readonly<{
  paymentId: string
  linkId: string
  referenceId: string
  /** What was paid in this payment, in paise. */
  amountPaise: number
  method: string
  /** UPI ID, bank or card network: shown as the receipt reference detail. */
  detail: string | null
  paidAt: Date
  notes: Readonly<Record<string, string>>
}>

type Entity = Record<string, unknown>

const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const obj = (value: unknown): Entity => (value && typeof value === 'object' ? (value as Entity) : {})

export function parsePaymentLinkPaid(body: unknown): PaidLinkEvent | null {
  const root = obj(body)
  if (root.event !== 'payment_link.paid') return null
  const payload = obj(root.payload)
  const link = obj(obj(payload.payment_link).entity)
  const payment = obj(obj(payload.payment).entity)
  const paymentId = str(payment.id)
  const linkId = str(link.id)
  const amountPaise = Number(payment.amount)
  if (!paymentId || !linkId || !Number.isInteger(amountPaise) || amountPaise <= 0) return null
  if (payment.status && payment.status !== 'captured') return null
  const created = Number(payment.created_at)
  const notesSource = { ...obj(link.notes), ...obj(payment.notes) }
  const notes = Object.fromEntries(Object.entries(notesSource).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  return {
    paymentId,
    linkId,
    referenceId: str(link.reference_id),
    amountPaise,
    method: str(payment.method) || 'gateway',
    detail: str(payment.vpa) || str(payment.bank) || str(obj(payment.card).network) || null,
    paidAt: Number.isFinite(created) && created > 0 ? new Date(created * 1000) : new Date(),
    notes,
  }
}
