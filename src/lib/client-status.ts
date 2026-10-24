/**
 * How a client's status reads in the app. The stored value stays 'lead', but
 * it shows as Prospect so it is never confused with an Orbit lead (audit A8).
 * Pure, safe on the client.
 */
export type ClientStatus = 'lead' | 'active' | 'inactive'

export const CLIENT_STATUS_LABEL: Readonly<Record<ClientStatus, string>> = { active: 'Active', lead: 'Prospect', inactive: 'Inactive' }
export const CLIENT_STATUS_PLURAL: Readonly<Record<ClientStatus, string>> = { active: 'Active', lead: 'Prospects', inactive: 'Inactive' }

export const clientStatusLabel = (status: string | null | undefined): string | undefined =>
  status && status in CLIENT_STATUS_LABEL ? CLIENT_STATUS_LABEL[status as ClientStatus] : undefined
