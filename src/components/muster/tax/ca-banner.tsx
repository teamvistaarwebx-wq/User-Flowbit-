import { Note } from '@/components/muster/ui/note'

/** Shown on every tax screen: the figures are an estimate to check, not tax advice. */
export function VerifyWithCa({ className }: { className?: string }) {
  return (
    <Note tone="warning" className={className} title="Verify with your CA">
      Flowbit estimates salary TDS from the slabs in force, the salary structure and the declarations. Tax law and your full income can change the answer, so have a chartered accountant check these figures before you rely on them.
    </Note>
  )
}
