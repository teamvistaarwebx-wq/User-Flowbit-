/** Fictional name pools and copy for Orbit's demo data. Pure. */

export const BRAND_PREFIXES = ['Kesar', 'Malabar', 'Urban', 'Saffron', 'Indus', 'Gulmohar', 'Neel', 'Chai', 'Desi', 'Banyan', 'Ritu', 'Amrit', 'Kaveri', 'Narmada', 'Sattva', 'Tulsi', 'Mitti', 'Aranya', 'Kanha', 'Zaffran']
export const BRAND_SUFFIXES = ['& Clay', 'Mornings Coffee', 'Pind Apparel', 'Trails', 'Leaf Teas', 'Naturals', 'Theory Co', 'Threads', 'Botanicals', 'Realty', 'Homes', 'Foundation', 'Learning Trust', 'Kitchens', 'Skincare', 'Jewels']
export const SUFFIX_SECTOR: Record<string, string> = { Realty: 'real_estate', Homes: 'real_estate', Foundation: 'dev_ngo', 'Learning Trust': 'dev_ngo' }

export const FIRST_NAMES = ['Aditi', 'Rohan', 'Priya', 'Karan', 'Sneha', 'Arjun', 'Meera', 'Vikram', 'Neha', 'Farhan', 'Ananya', 'Siddharth', 'Ishita', 'Kabir', 'Tanvi', 'Rahul', 'Pooja', 'Nikhil', 'Divya', 'Aman']
export const LAST_NAMES = ['Singh', 'Mehta', 'Nair', 'Malhotra', 'Kulkarni', 'Rao', 'Iyer', 'Shah', 'Joshi', 'Qureshi', 'Das', 'Jain', 'Kapoor', 'Reddy', 'Banerjee', 'Gupta']
export const DESIGNATIONS = ['Founder', 'Co-founder', 'Marketing Head', 'Growth Lead', 'Brand Manager', 'CEO', 'Head of E-commerce', 'Director', 'Programme Manager', 'Sales Head']

export const OUTREACH_NOTES = [
  'Sent intro DM with two case studies from similar D2C brands.',
  'Cold email: audit of their product pages, three quick wins listed.',
  'Called the office, got the founder’s WhatsApp number.',
  'Follow-up on the audit; asked for 20 minutes next week.',
  'Shared the Meta ads teardown we made for their category.',
  'Commented on their launch post, then DM’d with a reel idea.',
  'Second follow-up with pricing bands for a retainer.',
]
export const REPLY_NOTES = [
  'Replied: interested, but want to see results for a brand our size.',
  'Said they are reviewing agencies this quarter. Asked for a deck.',
  'Founder replied on WhatsApp, wants to talk after the sale ends.',
  'Not now, budget opens in November. Asked us to stay in touch.',
  'Marketing head replied, looping in the founder.',
]
export const MEETING_NOTES = [
  'Walked through the growth plan. They spend ₹3–4L a month on Meta; ROAS falling. Want a proposal for performance + creatives.',
  'Discovery call: Shopify store, 40% repeat customers, weak email flows. Decision maker is the co-founder; proposal by Friday.',
  'Site visit for the project launch. Need lead-gen for 120 units; budget ₹2.5L for the first quarter.',
  'Met the programme team. Donor portal and campaign site; grant timeline means a start in December.',
]
export const FOLLOW_UP_TITLES = ['Send the case-study deck', 'Share retainer pricing', 'Check if the founder saw the audit', 'Book the discovery call', 'Send revised proposal', 'Ping after their sale ends', 'Share the reel concepts']

/** The Orbit demo clients (fictional). Three of them come from converted leads. */
export const ORBIT_CLIENTS = [
  { name: 'Kesar & Clay Ceramics', state: 'MP', city: 'Indore', gstin: '23AAKCK4821M1Z3', sector: 'd2c', source: 'instagram', contact: ['Aditi Singh', 'Founder'], fromLead: true },
  { name: 'Malabar Mornings Coffee', state: 'KL', city: 'Kochi', gstin: '32AAQFM5517K1Z8', sector: 'd2c', source: 'linkedin', contact: ['Meera Iyer', 'Co-founder'], fromLead: true },
  { name: 'Narmada Valley Realty', state: 'MP', city: 'Jabalpur', gstin: '23AAJFN9034P1Z1', sector: 'real_estate', source: 'referral', contact: ['Vikram Shah', 'Director'], fromLead: true },
  { name: 'Gulmohar Learning Trust', state: 'MP', city: 'Bhopal', gstin: undefined, sector: 'dev_ngo', source: 'event', contact: ['Ananya Das', 'Programme Manager'], fromLead: false },
  { name: 'Urban Pind Apparel', state: 'DL', city: 'New Delhi', gstin: '07AAGCU2290R1Z6', sector: 'd2c', source: 'instagram', contact: ['Karan Malhotra', 'Founder'], fromLead: false },
  { name: 'Saffron Trails Travel', state: 'RJ', city: 'Jaipur', gstin: '08AAMFS7712L1Z4', sector: 'other', source: 'referral', contact: ['Sneha Kulkarni', 'Marketing Head'], fromLead: false },
  { name: 'Indus Leaf Teas', state: 'AS', city: 'Guwahati', gstin: '18AADCI6648H1Z9', sector: 'd2c', source: 'linkedin', contact: ['Farhan Qureshi', 'Head of E-commerce'], fromLead: false },
  { name: 'Neel Botanicals', state: 'KA', city: 'Bengaluru', gstin: '29AAHCN3305F1Z2', sector: 'd2c', source: 'inbound', contact: ['Priya Nair', 'CEO'], fromLead: false },
] as const
