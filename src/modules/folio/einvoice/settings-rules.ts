/**
 * E-invoice settings rules (pure). The stored GSP secret and password go only
 * to the address they were entered for: changing the GSP address or the
 * environment needs both entered again, so a settings editor who never saw
 * them cannot point the stored login at another server.
 */

export type StoredGspEndpoint = Readonly<{ baseUrl?: string | null; environment?: string | null; clientSecretSealed?: unknown; passwordSealed?: unknown }>
export type GspEndpointInput = Readonly<{ baseUrl?: string | null; environment: string; clientSecret?: string | null; password?: string | null }>

const norm = (url: string | null | undefined) => (url ?? '').trim().replace(/\/+$/, '').toLowerCase()

/** True when the address or environment differs from what the stored secrets were saved for. */
export function gspEndpointChanged(current: StoredGspEndpoint | null, input: GspEndpointInput): boolean {
  if (!current) return false
  return norm(current.baseUrl) !== norm(input.baseUrl) || (current.environment ?? 'sandbox') !== input.environment
}

/** A refusal message, or null: stored secrets cannot follow a changed endpoint unless both are entered again. */
export function endpointSecretsRefusal(current: StoredGspEndpoint | null, input: GspEndpointInput): string | null {
  if (!gspEndpointChanged(current, input)) return null
  const hasStored = Boolean(current?.clientSecretSealed || current?.passwordSealed)
  if (!hasStored) return null
  if (input.clientSecret && input.password) return null
  return 'You changed the GSP address or environment. Enter the client secret and password again so they are sent only to the new address.'
}
