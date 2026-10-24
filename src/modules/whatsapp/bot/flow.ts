import { formatDate } from '@/lib/dates'
import { botCopy } from './copy'
import { isCancel, parseChoice, parseDate, parseYesNo, type Lang } from './parse'

/**
 * The guided "apply for leave" conversation (pure): leave type → first day →
 * last day → reason → confirm. Each answer moves one step; a bad answer asks
 * again; "cancel" ends it. The final step hands back what to submit, and the
 * server runs the app's own leave rules on it.
 */

export const LEAVE_STEPS = ['type', 'start', 'end', 'reason', 'confirm'] as const
export type LeaveStep = (typeof LEAVE_STEPS)[number]

export type LeaveTypeOption = Readonly<{ id: string; name: string }>

export type LeaveFlowData = Readonly<{
  types: readonly LeaveTypeOption[]
  typeId?: string
  typeName?: string
  start?: string
  end?: string
  reason?: string
}>

export type LeaveSubmit = Readonly<{ leaveTypeId: string; startDate: string; endDate: string; reason: string; isHalfDay: false }>

export type FlowOutcome = Readonly<{
  reply: string
  /** The step to wait on next, or null when the conversation is over. */
  next: Readonly<{ step: LeaveStep; data: LeaveFlowData }> | null
  submit?: LeaveSubmit
}>

const MIN_REASON = 3

/** The first question: the active leave types, numbered. */
export function startLeaveFlow(types: readonly LeaveTypeOption[], lang: Lang): FlowOutcome {
  const list = types.map((t, i) => `${i + 1} ${t.name}`).join('\n')
  return { reply: botCopy(lang).leaveTypes(list), next: { step: 'type', data: { types } } }
}

export function advanceLeaveFlow(step: LeaveStep, data: LeaveFlowData, text: string, opts: { today: string; lang: Lang }): FlowOutcome {
  const copy = botCopy(opts.lang)
  if (isCancel(text)) return { reply: copy.cancelled, next: null }
  const stay = (reply: string): FlowOutcome => ({ reply, next: { step, data } })
  switch (step) {
    case 'type': {
      const index = parseChoice(text, data.types.length)
      if (index === null) return stay(copy.pickNumber)
      const type = data.types[index]
      return { reply: copy.askStart, next: { step: 'start', data: { ...data, typeId: type.id, typeName: type.name } } }
    }
    case 'start': {
      const start = parseDate(text, opts.today)
      if (!start) return stay(copy.badDate)
      return { reply: copy.askEnd, next: { step: 'end', data: { ...data, start } } }
    }
    case 'end': {
      const same = /^\s*(same|same day|वही|उसी दिन)\s*$/i.test(text)
      const end = same ? data.start : parseDate(text, opts.today)
      if (!end) return stay(copy.badDate)
      if (data.start && end < data.start) return stay(copy.endBeforeStart)
      return { reply: copy.askReason, next: { step: 'reason', data: { ...data, end } } }
    }
    case 'reason': {
      const reason = text.trim().slice(0, 500)
      if (reason.length < MIN_REASON) return stay(copy.reasonShort)
      const span = data.start === data.end ? formatDate(data.start) : `${formatDate(data.start, { short: true })} – ${formatDate(data.end)}`
      return { reply: copy.confirmLeave(`${data.typeName}: ${span}\n${reason}`), next: { step: 'confirm', data: { ...data, reason } } }
    }
    case 'confirm': {
      const yes = parseYesNo(text)
      if (yes === null) return stay(copy.confirmLeave(''))
      if (!yes || !data.typeId || !data.start || !data.end || !data.reason) return { reply: copy.leaveCancelled, next: null }
      return { reply: '', next: null, submit: { leaveTypeId: data.typeId, startDate: data.start, endDate: data.end, reason: data.reason, isHalfDay: false } }
    }
  }
}
