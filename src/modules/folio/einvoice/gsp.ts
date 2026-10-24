import type { IrnPayload } from './payload'

/**
 * A GST Suvidha Provider (GSP) in front of the NIC Invoice Registration
 * Portal. `GspProvider` is what Folio needs; `createGenericGsp` speaks the
 * common GSP flavour of the NIC REST API (auth token, then JSON calls with
 * client_id / client_secret / gstin / user_name / AuthToken headers, replies
 * shaped { Status, Data, ErrorDetails }). Most GSPs (and NIC's own sandbox
 * through a GSP) follow it; another flavour gets its own adapter behind the
 * same interface. The HTTP call is injected, so tests never touch the network.
 */

export type IrnResult = { irn: string; ackNo: string; ackDate: string; signedQr: string; signedInvoice: string | null; ewbNo: string | null; ewbDate: string | null; ewbValidTill: string | null }
export type CancelResult = { irn: string; cancelDate: string }
export type EwbResult = { ewbNo: string; ewbDate: string; validTill: string }

export interface GspProvider {
  generateIrn(payload: IrnPayload): Promise<IrnResult>
  cancelIrn(payload: { Irn: string; CnlRsn: string; CnlRem: string }): Promise<CancelResult>
  generateEwb(payload: Record<string, unknown>): Promise<EwbResult>
}

export type GspConfig = { baseUrl: string; clientId: string; clientSecret: string; username: string; password: string; gstin: string }

export type JsonPost = (url: string, body: unknown, headers: Record<string, string>) => Promise<{ status: number; json: unknown }>

/** A refusal from the GSP or IRP, worded for the person who pressed the button. */
export class GspError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message)
    this.name = 'GspError'
  }
}

/** NIC's "duplicate IRN" error: the document number is already registered. */
export const DUPLICATE_IRN = '2150'

type Envelope = { Status?: number | string; Data?: unknown; ErrorDetails?: { ErrorCode?: string; ErrorMessage?: string }[] | null; status_cd?: string; error?: { message?: string } }

const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : null)

/** The `Data` of a successful reply (an object, or a JSON string of one); throws GspError otherwise. */
export function readEnvelope(status: number, json: unknown): Record<string, unknown> {
  const env = record(json) as Envelope
  const ok = String(env.Status ?? env.status_cd ?? '') === '1'
  if (!ok || status >= 400) {
    const first = env.ErrorDetails?.[0]
    const message = first?.ErrorMessage ?? env.error?.message ?? (status >= 400 ? `The GSP answered with HTTP ${status}.` : 'The GSP refused the request.')
    throw new GspError(first?.ErrorCode ? `${message} (IRP error ${first.ErrorCode})` : message, first?.ErrorCode ?? null)
  }
  if (typeof env.Data === 'string') {
    try {
      return record(JSON.parse(env.Data))
    } catch {
      throw new GspError('The GSP sent a reply Flowbit could not read.')
    }
  }
  return record(env.Data)
}

function requireField(data: Record<string, unknown>, key: string): string {
  const value = str(data[key])
  if (!value) throw new GspError(`The GSP reply had no ${key}.`)
  return value
}

export function createGenericGsp(config: GspConfig, post: JsonPost): GspProvider {
  const base = config.baseUrl.replace(/\/+$/, '')
  const common = { client_id: config.clientId, client_secret: config.clientSecret, gstin: config.gstin, user_name: config.username }
  let token: string | null = null

  async function authToken(): Promise<string> {
    if (token) return token
    const res = await post(`${base}/eivital/v1.04/auth`, { UserName: config.username, Password: config.password, ForceRefreshAccessToken: false }, common)
    const data = readEnvelope(res.status, res.json)
    token = requireField(data, 'AuthToken')
    return token
  }

  async function call(path: string, body: unknown) {
    const res = await post(`${base}${path}`, body, { ...common, AuthToken: await authToken() })
    return readEnvelope(res.status, res.json)
  }

  return {
    async generateIrn(payload) {
      const d = await call('/eicore/v1.03/Invoice', payload)
      return {
        irn: requireField(d, 'Irn'), ackNo: requireField(d, 'AckNo'), ackDate: requireField(d, 'AckDt'), signedQr: requireField(d, 'SignedQRCode'),
        signedInvoice: str(d.SignedInvoice), ewbNo: str(d.EwbNo), ewbDate: str(d.EwbDt), ewbValidTill: str(d.EwbValidTill),
      }
    },
    async cancelIrn(payload) {
      const d = await call('/eicore/v1.03/Invoice/Cancel', payload)
      return { irn: requireField(d, 'Irn'), cancelDate: requireField(d, 'CancelDate') }
    },
    async generateEwb(payload) {
      const d = await call('/eiewb/v1.03/ewaybill', payload)
      return { ewbNo: requireField(d, 'EwbNo'), ewbDate: requireField(d, 'EwbDt'), validTill: str(d.EwbValidTill) ?? '' }
    },
  }
}

/** Default API bases by environment: NIC's sandbox and production IRP. A GSP's own base replaces them in settings. */
export const DEFAULT_BASE_URL = { sandbox: 'https://einv-apisandbox.nic.in', production: 'https://einvoice1.gst.gov.in' } as const
