import type { Ctx } from '@/lib/ctx'

/**
 * Messages log kinds this viewer may not read or resend (org.manage alone is
 * not enough): payslips and letters carry pay, claim codes and invite links
 * are live credentials, and a brief holds whatever its owner may see.
 */
export function hiddenMailKinds(ctx: Pick<Ctx, 'can'> & Partial<Pick<Ctx, 'isOwner'>>): string[] {
  const hidden: string[] = []
  if (!ctx.can('payroll.read')) hidden.push('payslip')
  if (!ctx.can('letters.read') || !ctx.can('payroll.read')) hidden.push('letter')
  if (!ctx.can('members.manage')) hidden.push('invite')
  if (!ctx.can('roles.manage')) hidden.push('claim_otp')
  if (!ctx.isOwner) hidden.push('brief')
  return hidden
}
