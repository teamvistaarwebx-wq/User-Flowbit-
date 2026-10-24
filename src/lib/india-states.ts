/**
 * The one Indian state / union territory table. `code2` is what Flowbit
 * stores (Org.state, Client.state, billing stateCode); `gstCode` is the
 * numeric code GSTINs start with and GST place of supply uses. Pure data,
 * safe on the client; also re-exported from `@/lib/validation`.
 */

export type IndiaState = {
  /** Two-letter code stored on records: 'MP'. */
  code2: string
  /** GST state code, two digits: '23'. */
  gstCode: string
  name: string
  isUT: boolean
}

export const INDIA_STATES: readonly IndiaState[] = [
  { code2: 'JK', gstCode: '01', name: 'Jammu and Kashmir', isUT: true },
  { code2: 'HP', gstCode: '02', name: 'Himachal Pradesh', isUT: false },
  { code2: 'PB', gstCode: '03', name: 'Punjab', isUT: false },
  { code2: 'CH', gstCode: '04', name: 'Chandigarh', isUT: true },
  { code2: 'UK', gstCode: '05', name: 'Uttarakhand', isUT: false },
  { code2: 'HR', gstCode: '06', name: 'Haryana', isUT: false },
  { code2: 'DL', gstCode: '07', name: 'Delhi', isUT: true },
  { code2: 'RJ', gstCode: '08', name: 'Rajasthan', isUT: false },
  { code2: 'UP', gstCode: '09', name: 'Uttar Pradesh', isUT: false },
  { code2: 'BR', gstCode: '10', name: 'Bihar', isUT: false },
  { code2: 'SK', gstCode: '11', name: 'Sikkim', isUT: false },
  { code2: 'AR', gstCode: '12', name: 'Arunachal Pradesh', isUT: false },
  { code2: 'NL', gstCode: '13', name: 'Nagaland', isUT: false },
  { code2: 'MN', gstCode: '14', name: 'Manipur', isUT: false },
  { code2: 'MZ', gstCode: '15', name: 'Mizoram', isUT: false },
  { code2: 'TR', gstCode: '16', name: 'Tripura', isUT: false },
  { code2: 'ML', gstCode: '17', name: 'Meghalaya', isUT: false },
  { code2: 'AS', gstCode: '18', name: 'Assam', isUT: false },
  { code2: 'WB', gstCode: '19', name: 'West Bengal', isUT: false },
  { code2: 'JH', gstCode: '20', name: 'Jharkhand', isUT: false },
  { code2: 'OD', gstCode: '21', name: 'Odisha', isUT: false },
  { code2: 'CG', gstCode: '22', name: 'Chhattisgarh', isUT: false },
  { code2: 'MP', gstCode: '23', name: 'Madhya Pradesh', isUT: false },
  { code2: 'GJ', gstCode: '24', name: 'Gujarat', isUT: false },
  { code2: 'DN', gstCode: '26', name: 'Dadra and Nagar Haveli and Daman and Diu', isUT: true },
  { code2: 'MH', gstCode: '27', name: 'Maharashtra', isUT: false },
  { code2: 'KA', gstCode: '29', name: 'Karnataka', isUT: false },
  { code2: 'GA', gstCode: '30', name: 'Goa', isUT: false },
  { code2: 'LD', gstCode: '31', name: 'Lakshadweep', isUT: true },
  { code2: 'KL', gstCode: '32', name: 'Kerala', isUT: false },
  { code2: 'TN', gstCode: '33', name: 'Tamil Nadu', isUT: false },
  { code2: 'PY', gstCode: '34', name: 'Puducherry', isUT: true },
  { code2: 'AN', gstCode: '35', name: 'Andaman and Nicobar Islands', isUT: true },
  { code2: 'TS', gstCode: '36', name: 'Telangana', isUT: false },
  { code2: 'AP', gstCode: '37', name: 'Andhra Pradesh', isUT: false },
  { code2: 'LA', gstCode: '38', name: 'Ladakh', isUT: true },
  { code2: 'OT', gstCode: '97', name: 'Other Territory', isUT: true },
]

const BY_CODE2 = new Map(INDIA_STATES.map((s) => [s.code2, s]))
const BY_GST = new Map(INDIA_STATES.map((s) => [s.gstCode, s]))

/** 'mp' or 'MP' -> the state; undefined when unknown. */
export const stateByCode2 = (code: string | null | undefined): IndiaState | undefined =>
  code ? BY_CODE2.get(code.trim().toUpperCase()) : undefined

/** '23' or 23 -> the state; undefined when unknown. */
export const stateByGstCode = (code: string | number | null | undefined): IndiaState | undefined =>
  code == null ? undefined : BY_GST.get(String(code).padStart(2, '0'))

/** The state a GSTIN is registered in (its first two digits). */
export const stateOfGstin = (gstin: string | null | undefined): IndiaState | undefined =>
  gstin && /^\d{2}/.test(gstin.trim()) ? stateByGstCode(gstin.trim().slice(0, 2)) : undefined

/** True when the GSTIN's first two digits are the GST code of `code2`. */
export const gstinMatchesState = (gstin: string | null | undefined, code2: string | null | undefined): boolean => {
  const fromGstin = stateOfGstin(gstin)
  return Boolean(fromGstin && fromGstin.code2 === stateByCode2(code2)?.code2)
}

/** "Madhya Pradesh (23)" for invoices and error copy; the raw code when unknown. */
export const stateLabel = (code2: string | null | undefined): string => {
  const state = stateByCode2(code2)
  return state ? `${state.name} (${state.gstCode})` : (code2 ?? '')
}

/** Select options for address forms (Other Territory excluded), sorted by name. */
export const STATE_OPTIONS: { value: string; label: string }[] = INDIA_STATES.filter((s) => s.code2 !== 'OT')
  .map((s) => ({ value: s.code2, label: s.name }))
  .sort((a, b) => a.label.localeCompare(b.label))
