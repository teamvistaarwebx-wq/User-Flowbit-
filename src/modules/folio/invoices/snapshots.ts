import type { Types } from 'mongoose'
import { UserError } from '@/lib/errors'
import type { ClientDoc, EntityDoc } from '../context'
import { stateCodeOfGstin } from '../engine/gst'
import { gstCodeFromAny, gstCodeFromStateLetters, stateName } from '../engine/states'

/**
 * Snapshots frozen onto an issued document, so editing a client or an entity
 * later never rewrites an invoice that has already gone out.
 */

export type PartySnapshot = { name: string; addressLines: string[]; city: string; stateCode: string; stateName: string; pincode: string; country: string; gstin?: string }

export function billToOf(client: ClientDoc): PartySnapshot {
  const address = client.billingAddress
  const stateCode = gstCodeFromAny(address?.state) ?? gstCodeFromStateLetters(client.state) ?? (client.gstin ? stateCodeOfGstin(client.gstin) : null) ?? ''
  return {
    name: client.name,
    addressLines: [address?.line1, address?.line2].filter((l): l is string => Boolean(l)),
    city: address?.city ?? '',
    stateCode,
    stateName: stateName(stateCode),
    pincode: address?.pincode ?? '',
    country: address?.country ?? 'India',
    ...(client.gstin ? { gstin: client.gstin } : {}),
  }
}

export function issuerOf(entity: EntityDoc) {
  const isTax = entity.kind === 'gst'
  return {
    legalName: entity.legalName,
    tradeName: entity.tradeName ?? undefined,
    gstin: isTax ? (entity.gstin ?? undefined) : undefined,
    pan: entity.pan ?? undefined,
    cinLlpin: entity.cinLlpin ?? undefined,
    addressLines: [entity.address.line1, entity.address.line2].filter((l): l is string => Boolean(l)),
    city: entity.address.city,
    stateCode: entity.address.stateCode,
    stateName: stateName(entity.address.stateCode),
    pincode: entity.address.pincode,
    email: entity.email ?? undefined,
    phone: entity.phone ?? undefined,
    website: entity.website ?? undefined,
    logoFileId: entity.logoFileId ?? undefined,
    signatoryName: entity.signatoryName ?? undefined,
    signatoryTitle: entity.signatoryTitle ?? undefined,
    signatureFileId: entity.signatureFileId ?? undefined,
  }
}

export type BankChoice = { bankAccountId: Types.ObjectId | null; bank: { accountName: string; accountNumber: string; ifsc: string; bankName: string; branch?: string; upiId?: string } | null }

/** The chosen account (must belong to the entity), else the entity's default, else none. */
export function bankOf(entity: EntityDoc, bankAccountId?: string | null): BankChoice {
  const accounts = entity.bankAccounts ?? []
  const chosen = bankAccountId ? accounts.find((a) => String(a._id) === bankAccountId) : (accounts.find((a) => a.isDefault) ?? accounts[0])
  if (bankAccountId && !chosen) throw new UserError('That bank account does not belong to this entity.', { bankAccountId: 'Pick one of this entity’s accounts' })
  if (!chosen) return { bankAccountId: null, bank: null }
  return {
    bankAccountId: chosen._id,
    bank: { accountName: chosen.accountName, accountNumber: chosen.accountNumber, ifsc: chosen.ifsc, bankName: chosen.bankName, branch: chosen.branch ?? undefined, upiId: chosen.upiId ?? undefined },
  }
}
