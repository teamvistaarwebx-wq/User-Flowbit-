import type { NextRequest } from 'next/server'
import { Types } from 'mongoose'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { contentDisposition } from '@/lib/file-response'
import { Department } from '@/models/muster/Department'
import { Employee, WITHOUT_SENSITIVE } from '@/models/muster/Employee'
import { toCsv } from '@/modules/muster/import/csv'
import { DIRECTORY_STATUSES, EMPLOYMENT_TYPE_LABEL, statusLabelOf, WORK_MODE_LABEL, workModeOf, type EmploymentType } from '@/modules/muster/people/lifecycle'
import { visibleEmployeeIds, visibleFilter } from '@/modules/muster/people/scope'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Status filters the directory offers; anything else exports everyone and is named "all" (R3 L-23d). */
const STATUS_FILTERS = ['current', 'past', 'probation', 'notice_period'] as const
const fileStatus = (status: string): string => ((STATUS_FILTERS as readonly string[]).includes(status) ? status : 'all')

const COLUMNS = ['Code', 'Name', 'Work email', 'Phone', 'Department', 'Designation', 'Type', 'Status', 'Joined', 'Last working day', 'Location', 'Work mode']

/** Directory export (no sensitive fields), honouring the status and department filters. */
export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('muster') || !ctx.can('people.read')) return new Response('Not allowed', { status: 403 })
  const status = request.nextUrl.searchParams.get('status') ?? 'current'
  const dept = request.nextUrl.searchParams.get('dept')
  const filter: Record<string, unknown> = { deletedAt: null, ...visibleFilter(await visibleEmployeeIds(ctx)) }
  if (status === 'current') filter.status = { $in: DIRECTORY_STATUSES }
  else if (status === 'past') filter.status = { $nin: DIRECTORY_STATUSES }
  else if (status === 'probation') filter.status = 'probation'
  else if (status === 'notice_period') filter.status = { $in: ['notice_period', 'resigned'] }
  if (dept && Types.ObjectId.isValid(dept)) filter.departmentId = new Types.ObjectId(dept)
  const [rows, departments] = await Promise.all([
    ctx.db(Employee).find(filter, WITHOUT_SENSITIVE).sort({ fullName: 1 }).lean(),
    ctx.db(Department).find({}, { name: 1 }).lean(),
  ])
  const deptName = new Map(departments.map((d) => [String(d._id), d.name]))
  const data = rows.map((r) => ({
    Code: r.code, Name: r.fullName, 'Work email': r.workEmail, Phone: r.phone ?? '', Department: r.departmentId ? (deptName.get(String(r.departmentId)) ?? '') : '',
    Designation: r.designation ?? '', Type: EMPLOYMENT_TYPE_LABEL[r.employmentType as EmploymentType] ?? r.employmentType, Status: statusLabelOf(r.status),
    Joined: r.joinDate, 'Last working day': r.exitDate ?? '', Location: r.workLocation ?? '', 'Work mode': WORK_MODE_LABEL[workModeOf(r.workMode)],
  }))
  return new Response(`﻿${toCsv(data, COLUMNS)}\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': contentDisposition('attachment', `people-${fileStatus(status)}.csv`) } })
}
