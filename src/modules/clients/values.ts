/** Client form values (plain strings) shared by the server pages and the client form. Pure. */

export type ClientValues = {
  id?: string
  kind: 'company' | 'individual'
  name: string
  displayName: string
  email: string
  phone: string
  website: string
  gstin: string
  pan: string
  state: string
  billingAddress: { line1: string; line2: string; city: string; state: string; pincode: string; country: string }
  ownerId: string
  tags: string[]
  source: string
  sector: string
  status: 'lead' | 'active' | 'inactive'
  notes: string
}

export const EMPTY_CLIENT: ClientValues = {
  kind: 'company', name: '', displayName: '', email: '', phone: '', website: '', gstin: '', pan: '', state: '',
  billingAddress: { line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' }, ownerId: '', tags: [], source: '', sector: '', status: 'active', notes: '',
}
