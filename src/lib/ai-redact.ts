/**
 * Strips money and identity details from text before it goes to the AI
 * provider: salary or CTC amounts, bank account numbers, IFSC codes and PAN.
 * Arc only reads Work data, so this is a second line of defence for anything
 * someone typed into a task or project. Pure.
 */

const PAN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g
const IFSC = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g
/** 9 to 18 digits, optionally grouped by spaces or hyphens: bank account and card numbers. */
const LONG_NUMBER = /\b\d(?:[ -]?\d){8,17}\b/g
const PAY_WORDS = String.raw`salary|salaries|ctc|gross pay|net pay|basic pay|take[- ]home|payslip|stipend|bank account|account no\.?|a\/c no\.?|pan`
/** A pay word followed (within a few words) by an amount, e.g. "CTC: ₹12,00,000" or "salary 45k". */
const PAY_AMOUNT = new RegExp(String.raw`\b(${PAY_WORDS})\b([^\n\d₹]{0,30})(?:₹|rs\.?|inr)?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:lakhs?|lpa|l|k|cr|crores?)\b)?`, 'gi')

export function redactSensitive(text: string): string {
  return text
    .replace(PAY_AMOUNT, (_match, word: string, gap: string) => `${word}${gap}[amount removed]`)
    .replace(PAN, '[PAN removed]')
    .replace(IFSC, '[IFSC removed]')
    .replace(LONG_NUMBER, '[number removed]')
}
