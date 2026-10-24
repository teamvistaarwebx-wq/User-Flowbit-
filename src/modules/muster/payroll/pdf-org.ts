import { companyProfileOf, profileAddressLines, type ProfileSource } from '@/lib/company-profile'

/** The company address as one line ("2nd Floor, Sapphire Tower, Indore, Madhya Pradesh, 452010"), from the company profile. */
export function orgAddressLine(org: ProfileSource): string {
  return profileAddressLines(companyProfileOf(org)).join(', ')
}
