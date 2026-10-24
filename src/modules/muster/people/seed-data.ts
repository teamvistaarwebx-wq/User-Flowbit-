import type { EmployeeStatus } from './lifecycle'

/**
 * Demo people for the Muster seed (Vistaar WebX, October 2026). Role members
 * are matched by role key, demo members by name; the last four have no login.
 */

export const DEPARTMENTS = [
  { name: 'Leadership', code: 'LEAD' },
  { name: 'Operations', code: 'OPS' },
  { name: 'People', code: 'HR' },
  { name: 'Finance', code: 'FIN' },
  { name: 'Delivery', code: 'DEL' },
  { name: 'Sales', code: 'SALES' },
  { name: 'Development', code: 'DEV' },
  { name: 'Design', code: 'DES' },
  { name: 'Marketing', code: 'MKT' },
]

export const DESIGNATIONS = [
  'Founder & CEO', 'Operations Lead', 'HR Manager', 'HR Executive', 'Finance Manager', 'Delivery Manager', 'Business Development', 'Frontend Developer',
  'Backend Developer', 'UI/UX Designer', 'QA Engineer', 'Content Strategist', 'Performance Marketer', 'Project Coordinator', 'Full-stack Developer',
  'Graphic Designer', 'Design Intern', 'Marketing Executive',
]

export type SeedPerson = {
  key: string
  role?: string
  name: string
  email?: string
  dept: string
  title: string
  manager?: string
  type: 'full_time' | 'part_time' | 'intern' | 'contract'
  status: EmployeeStatus
  join: string
  dob: string
  gender: 'female' | 'male'
  exit?: string
  exitReason?: string
  resignation?: string
  pan?: string
  bank?: boolean
  pf?: boolean
  phone: string
  city: string
}

export const PEOPLE: SeedPerson[] = [
  { key: 'owner', role: 'owner', name: 'Sanskaar Singh', dept: 'LEAD', title: 'Founder & CEO', type: 'full_time', status: 'confirmed', join: '2021-04-01', dob: '1994-02-14', gender: 'male', pan: 'BXKPS4821L', bank: true, phone: '9826012345', city: 'Indore' },
  { key: 'admin', role: 'admin', name: 'Aditi Sharma', dept: 'OPS', title: 'Operations Lead', manager: 'owner', type: 'full_time', status: 'confirmed', join: '2021-09-06', dob: '1993-11-02', gender: 'female', pan: 'CQWPS7310M', bank: true, phone: '9893045678', city: 'Indore' },
  { key: 'hr_admin', role: 'hr_admin', name: 'Neha Verma', dept: 'HR', title: 'HR Manager', manager: 'owner', type: 'full_time', status: 'confirmed', join: '2022-01-10', dob: '1991-10-18', gender: 'female', pan: 'AHVPV2245Q', bank: true, phone: '9755023456', city: 'Bhopal' },
  { key: 'hr_exec', role: 'hr_exec', name: 'Rohan Mehta', dept: 'HR', title: 'HR Executive', manager: 'hr_admin', type: 'full_time', status: 'active', join: '2024-06-03', dob: '1998-05-27', gender: 'male', pan: 'DLMPM6620R', bank: true, pf: true, phone: '9179034567', city: 'Indore' },
  { key: 'finance', role: 'finance', name: 'Priya Iyer', dept: 'FIN', title: 'Finance Manager', manager: 'owner', type: 'full_time', status: 'confirmed', join: '2022-07-18', dob: '1990-03-09', gender: 'female', pan: 'AJIPI8123K', bank: true, phone: '9821056789', city: 'Pune' },
  { key: 'manager', role: 'manager', name: 'Arjun Nair', dept: 'DEL', title: 'Delivery Manager', manager: 'owner', type: 'full_time', status: 'confirmed', join: '2022-03-14', dob: '1989-12-30', gender: 'male', pan: 'BNRPN5532H', bank: true, phone: '9846067890', city: 'Kochi' },
  { key: 'sales', role: 'sales', name: 'Kavya Reddy', dept: 'SALES', title: 'Business Development', manager: 'owner', type: 'full_time', status: 'probation', join: '2026-07-01', dob: '1997-08-21', gender: 'female', pan: 'EKRPR9081N', bank: true, pf: true, phone: '9849078901', city: 'Hyderabad' },
  { key: 'member', role: 'member', name: 'Vikram Joshi', dept: 'DEV', title: 'Frontend Developer', manager: 'manager', type: 'full_time', status: 'active', join: '2024-02-12', dob: '1999-01-15', gender: 'male', pan: 'FVJPJ3345B', bank: true, pf: true, phone: '9977089012', city: 'Indore' },
  { key: 'ishaan', name: 'Ishaan Gupta', dept: 'DEV', title: 'Backend Developer', manager: 'manager', type: 'full_time', status: 'confirmed', join: '2023-10-09', dob: '1996-06-04', gender: 'male', pan: 'GIGPG7712C', bank: true, pf: true, phone: '9926090123', city: 'Indore' },
  { key: 'meera', name: 'Meera Pillai', dept: 'DES', title: 'UI/UX Designer', manager: 'manager', type: 'full_time', status: 'confirmed', join: '2023-01-16', dob: '1995-10-08', gender: 'female', pan: 'HMPPP4410D', bank: true, phone: '9895001234', city: 'Kochi' },
  { key: 'siddharth', name: 'Siddharth Rao', dept: 'DEV', title: 'QA Engineer', manager: 'manager', type: 'full_time', status: 'probation', join: '2026-08-17', dob: '2000-09-12', gender: 'male', phone: '9886012345', city: 'Bengaluru' },
  { key: 'ananya', name: 'Ananya Kulkarni', dept: 'MKT', title: 'Content Strategist', manager: 'admin', type: 'full_time', status: 'active', join: '2025-03-03', dob: '1998-04-19', gender: 'female', pan: 'JAKPK2290F', bank: true, pf: true, phone: '9850023456', city: 'Pune' },
  { key: 'karan', name: 'Karan Malhotra', dept: 'MKT', title: 'Performance Marketer', manager: 'admin', type: 'full_time', status: 'active', join: '2025-05-19', dob: '1997-10-21', gender: 'male', pan: 'KKMPM8801G', bank: true, pf: true, phone: '9810034567', city: 'Delhi' },
  { key: 'pooja', name: 'Pooja Desai', dept: 'DEL', title: 'Project Coordinator', manager: 'manager', type: 'full_time', status: 'confirmed', join: '2023-08-07', dob: '1996-12-02', gender: 'female', pan: 'LPDPD5567J', bank: true, pf: true, phone: '9825045678', city: 'Ahmedabad' },
  { key: 'rahul', name: 'Rahul Chauhan', dept: 'DEV', title: 'Full-stack Developer', manager: 'manager', type: 'full_time', status: 'notice_period', join: '2023-04-10', dob: '1995-07-25', gender: 'male', resignation: '2026-09-21', exit: '2026-10-20', pan: 'MRCPC1123K', bank: true, pf: true, phone: '9829056789', city: 'Jaipur' },
  { key: 'sneha', name: 'Sneha Banerjee', dept: 'DES', title: 'Graphic Designer', manager: 'meera', type: 'full_time', status: 'active', join: '2024-11-04', dob: '1999-10-27', gender: 'female', pan: 'NSBPB6678L', bank: true, pf: true, phone: '9830067890', city: 'Kolkata' },
  { key: 'tanvi', name: 'Tanvi Joshi', email: 'tanvi.joshi@flowbit.test', dept: 'DES', title: 'Design Intern', manager: 'meera', type: 'intern', status: 'intern', join: '2026-07-01', dob: '2004-03-11', gender: 'female', phone: '9993078901', city: 'Indore' },
  { key: 'harsh', name: 'Harsh Vardhan', email: 'harsh.vardhan@flowbit.test', dept: 'DEV', title: 'Backend Developer', manager: 'manager', type: 'full_time', status: 'confirmed', join: '2024-09-02', dob: '1997-02-08', gender: 'male', pan: 'PHVPV3390M', bank: true, pf: true, phone: '9752089012', city: 'Indore' },
  { key: 'manish', name: 'Manish Yadav', email: 'manish.yadav@flowbit.test', dept: 'DEV', title: 'Frontend Developer', manager: 'manager', type: 'full_time', status: 'exited', join: '2024-01-08', dob: '1996-08-30', gender: 'male', exit: '2026-09-15', exitReason: 'Moved to a product company in Bengaluru', resignation: '2026-08-14', pan: 'QMYPY4456N', bank: true, pf: true, phone: '9754090123', city: 'Indore' },
  { key: 'riya', name: 'Riya Kapoor', email: 'riya.kapoor@flowbit.test', dept: 'MKT', title: 'Marketing Executive', manager: 'admin', type: 'full_time', status: 'joining_pending', join: '2026-10-12', dob: '2001-05-05', gender: 'female', phone: '9811001234', city: 'Delhi' },
]

export const HOLIDAYS_2026 = [
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-04', name: 'Holi' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-08-28', name: 'Raksha Bandhan', isOptional: true },
  { date: '2026-10-02', name: 'Gandhi Jayanti' },
  { date: '2026-10-20', name: 'Dussehra' },
  { date: '2026-11-09', name: 'Diwali' },
  { date: '2026-11-10', name: 'Govardhan Puja' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti', isOptional: true },
  { date: '2026-12-25', name: 'Christmas' },
  { date: '2027-01-26', name: 'Republic Day' },
]

const BANKS = [['HDFC Bank', 'HDFC0001234'], ['ICICI Bank', 'ICIC0000456'], ['State Bank of India', 'SBIN0003029'], ['Axis Bank', 'UTIB0000789'], ['Kotak Mahindra Bank', 'KKBK0005033']] as const

/** A plausible bank account for the i-th person. */
export function bankFor(name: string, i: number) {
  const [bankName, ifsc] = BANKS[i % BANKS.length]
  return { bankName, ifsc, accountName: name, accountNumber: `50100${String(31_004_570 + i * 7_919).padStart(9, '0')}` }
}
