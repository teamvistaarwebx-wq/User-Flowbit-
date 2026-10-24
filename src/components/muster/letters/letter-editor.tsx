'use client'

import { Hammer, Save, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { discardLetterDraft, issueLetter, saveLetterDraft } from '@/modules/muster/letters/actions'
import { LETTERS_BY_CODE } from '@/modules/muster/letters/catalogue'
import { inputVariables, letterVariables, placeholdersIn, renderTemplate, type LetterVariables } from '@/modules/muster/letters/render'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionLabel } from '@/components/ui/card'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { CUSTOM_SIGNER } from '@/modules/muster/letters/signatory'
import { Note } from '../ui/note'

export type LetterSignerOption = { id: string; name: string; designation: string; hasSignature: boolean }

type Props = {
  id: string
  templateCode: string
  /** The template wording (with placeholders) and the record's values, so the preview re-renders as fields change. */
  template: { subject: string; body: string }
  base: LetterVariables
  reference: string
  values: Record<string, string>
  issueDate: string
  signatoryName: string
  signatoryDesignation: string
  /** The company signatory who signs (their id), or 'custom' for a typed-in name. */
  signatoryChoice: string
  /** Authorised signatories from the company profile. */
  signers: LetterSignerOption[]
  subject: string
  body: string
  wordingEdited: boolean
  name: string
}

/**
 * The draft editor. While the wording follows the template, every change to
 * the details re-renders the subject and body (nothing is duplicated or
 * lost). Typing in the wording switches to hand-edited; "Rebuild from
 * template" switches back and replaces those edits.
 */
export function LetterEditor(props: Props) {
  const { id, template, base, reference, name } = props
  const definition = LETTERS_BY_CODE.get(props.templateCode)
  const router = useRouter()
  // The draft is gone after this, so follow the action back to the Letters list.
  const discard = async () => {
    const result = await discardLetterDraft({ id })
    if (result.ok && result.redirect) router.push(result.redirect)
    return result
  }
  const [inputs, setInputs] = useState<Record<string, string>>(props.values)
  const [issueDate, setIssueDate] = useState(props.issueDate)
  const [signatoryName, setSignatoryName] = useState(props.signatoryName)
  const [signatoryDesignation, setSignatoryDesignation] = useState(props.signatoryDesignation)
  const [choice, setChoice] = useState(props.signatoryChoice)
  const chosen = props.signers.find((s) => s.id === choice) ?? null
  /** A company signatory signs with their own name and designation; "someone else" types them. */
  const pickSigner = (next: string) => {
    setChoice(next)
    const signer = props.signers.find((s) => s.id === next)
    if (signer) {
      setSignatoryName(signer.name)
      setSignatoryDesignation(signer.designation)
    }
  }
  const [edited, setEdited] = useState(props.wordingEdited)
  const [subjectText, setSubjectText] = useState(props.subject)
  const [bodyText, setBodyText] = useState(props.body)

  const variables = useMemo(
    () => ({ ...base, ...letterVariables({ reference, issueDate, signatoryName, signatoryDesignation }), ...inputVariables(inputs, definition) }),
    [base, reference, issueDate, signatoryName, signatoryDesignation, inputs, definition],
  )
  const subject = edited ? subjectText : renderTemplate(template.subject, variables)
  const body = edited ? bodyText : renderTemplate(template.body, variables)
  const unfilled = placeholdersIn(`${subject}\n${body}`)
  const dirty = subject !== props.subject || body !== props.body || issueDate !== props.issueDate || signatoryName !== props.signatoryName || signatoryDesignation !== props.signatoryDesignation || choice !== props.signatoryChoice

  /** First keystroke in the wording starts from what is on screen, then keeps HR's text. */
  const editWording = (next: { subject?: string; body?: string }) => {
    setSubjectText(next.subject ?? subject)
    setBodyText(next.body ?? body)
    setEdited(true)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ActionForm action={saveLetterDraft} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="followTemplate" value={edited ? '0' : '1'} />
        {definition?.inputs.length ? (
          <div className="grid gap-3 lit-edge rounded-[10px] bg-white/[0.035] p-4 sm:grid-cols-2">
            <SectionLabel className="sm:col-span-2">Details for this letter</SectionLabel>
            {definition.inputs.map((f) => {
              const field = `inputs.${f.name}`
              const common = { id: field, name: field, value: inputs[f.name] ?? '', onChange: (e: { target: { value: string } }) => setInputs((prev) => ({ ...prev, [f.name]: e.target.value })) }
              return (
                <FormField key={f.name} name={field} label={f.label} required={f.required} help={f.hint} className={f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
                  {f.type === 'textarea' ? <Textarea rows={3} {...common} /> : f.type === 'date' ? <DateInput {...common} /> : <Input inputMode={f.type === 'number' ? 'decimal' : undefined} {...common} />}
                </FormField>
              )
            })}
            <p className="text-xs text-fg-2 sm:col-span-2">{edited ? 'You have edited the wording by hand, so these details no longer flow into it. Rebuild from the template to apply them.' : 'The wording updates as you type.'}</p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="issueDate" label="Issue date" required><DateInput id="issueDate" name="issueDate" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></FormField>
          <FormField name="signatoryChoice" label="Signed by" required help={chosen ? (chosen.hasSignature ? 'Their signature and seal print on the letter.' : 'No signature image on file: the letter prints a line to sign on.') : 'Typed name: the letter prints a line to sign on.'}>
            <NativeSelect id="signatoryChoice" name="signatoryChoice" value={choice} onChange={(e) => pickSigner(e.target.value)} options={[...props.signers.map((s) => ({ value: s.id, label: `${s.name}, ${s.designation}` })), { value: CUSTOM_SIGNER, label: 'Someone else (type the name)' }]} />
          </FormField>
          {chosen ? (
            <>
              <input type="hidden" name="signatoryName" value={signatoryName} />
              <input type="hidden" name="signatoryDesignation" value={signatoryDesignation} />
            </>
          ) : (
            <>
              <FormField name="signatoryName" label="Signatory name" required><Input id="signatoryName" name="signatoryName" value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} /></FormField>
              <FormField name="signatoryDesignation" label="Their designation" required><Input id="signatoryDesignation" name="signatoryDesignation" value={signatoryDesignation} onChange={(e) => setSignatoryDesignation(e.target.value)} /></FormField>
            </>
          )}
        </div>
        <FormField name="subject" label="Subject" required>
          <Input id="subject" name="subject" value={subject} onChange={(e) => editWording({ subject: e.target.value })} />
        </FormField>
        <FormField name="body" label="Body" required help={edited ? 'Edited by hand. Blank lines separate paragraphs.' : 'Follows the template. Typing here switches to your own wording.'}>
          <Textarea id="body" name="body" rows={16} value={body} onChange={(e) => editWording({ body: e.target.value })} />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <ConfirmDialog
            trigger={<Button type="button" variant="ghost" icon={<Trash2 className="size-4" />}>Discard draft</Button>}
            title="Discard this draft?"
            description="It is deleted. Its reference number is not reused."
            confirmLabel="Discard"
            onConfirm={discard}
          />
          {edited ? (
            <ConfirmDialog
              trigger={<Button type="button" variant="secondary" icon={<Hammer className="size-4" />}>Rebuild from template</Button>}
              title="Rebuild the wording from the template?"
              description="Your edits to the subject and body are replaced with the template, filled with the details above. Save the draft to keep it."
              confirmLabel="Rebuild"
              tone="primary"
              onConfirm={() => setEdited(false)}
            />
          ) : null}
          <SubmitButton icon={<Save className="size-4" />}>Save draft</SubmitButton>
        </div>
      </ActionForm>
      <div className="space-y-3">
        <SectionLabel>Preview</SectionLabel>
        {/* The page itself is paper: the PDF prints dark ink on white, so the preview does too. */}
        <article className="rounded-[12px] bg-[#FBFAFC] p-6 text-[13px] leading-relaxed text-[#1A1626] shadow-[0_0_0_1px_rgba(255,255,255,0.12)]">
          <p className="mb-2 font-semibold">{name}</p>
          <p className="mb-3 font-bold">{subject}</p>
          {body.split(/\n\s*\n/).filter((p) => p.trim()).map((p, i) => (
            <p key={i} className="mb-2 whitespace-pre-line">{p.trim()}</p>
          ))}
          <p className="mt-6 text-[#6B6478]">{signatoryName}</p>
          <p className="text-[#6B6478]">{signatoryDesignation}</p>
        </article>
        {unfilled.length ? (
          <Note compact tone="warning">Still unfilled: {unfilled.map((k) => `{{${k}}}`).join(', ')}. Fill in the details, or edit the text, then save before issuing.</Note>
        ) : dirty ? (
          <Note compact tone="neutral">You have unsaved changes. Save the draft, then issue it.</Note>
        ) : (
          <ConfirmDialog
            trigger={<Button variant="primary" className="w-full">Issue letter</Button>}
            title="Issue this letter?"
            description={`Signed by ${signatoryName}, ${signatoryDesignation}${chosen?.hasSignature ? ', with their signature' : ''}. The wording is locked, a PDF is filed on the person’s record, and they can download it. To change who signs, pick another signatory above and save first.`}
            confirmLabel="Issue"
            tone="primary"
            onConfirm={() => issueLetter({ id })}
          />
        )}
      </div>
    </div>
  )
}
