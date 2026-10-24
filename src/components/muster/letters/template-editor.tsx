'use client'

import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from '@/lib/toast'
import { resetLetterTemplate, saveLetterTemplate } from '@/modules/muster/letters/actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionLabel } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'

type Reference = { group: string; keys: { key: string; describes: string }[] }[]

/** Edit a template's wording, with the placeholders this reader may use one click away. */
export function TemplateEditor({ code, subject, body, customised, reference }: { code: string; subject: string; body: string; customised: boolean; reference: Reference }) {
  const [text, setText] = useState(body)
  const insert = async (key: string) => {
    const token = `{{${key}}}`
    setText((cur) => `${cur}${cur.endsWith('\n') || !cur ? '' : ' '}${token}`)
    try {
      await navigator.clipboard.writeText(token)
      toast.message(`${token} added at the end and copied`)
    } catch {
      toast.message(`${token} added at the end`)
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ActionForm action={saveLetterTemplate} className="space-y-4 lg:col-span-2" key={code}>
        <input type="hidden" name="code" value={code} />
        <FormField name="subject" label="Subject" required>
          <Input id="subject" name="subject" defaultValue={subject} />
        </FormField>
        <FormField name="body" label="Body" required help="Blank lines separate paragraphs. A paragraph whose placeholder is empty is left out.">
          <Textarea id="body" name="body" rows={18} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-[13px]" />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          {customised ? (
            <ConfirmDialog
              trigger={<Button type="button" variant="ghost" icon={<RotateCcw className="size-4" />}>Reset to shipped wording</Button>}
              title="Reset this template?"
              description="Your edits to this template are removed. Letters already drafted keep their text."
              confirmLabel="Reset"
              onConfirm={() => resetLetterTemplate({ code })}
            />
          ) : null}
          <SubmitButton>Save template</SubmitButton>
        </div>
      </ActionForm>
      <aside className="space-y-3 lit-edge rounded-[10px] bg-white/[0.035] p-4">
        <SectionLabel>Placeholders</SectionLabel>
        {reference.map((g) => (
          <div key={g.group}>
            <p className="mb-1 text-[13px] font-medium text-white/80">{g.group}</p>
            <ul className="space-y-1">
              {g.keys.map((k) => (
                <li key={k.key}>
                  <button type="button" onClick={() => insert(k.key)} className="press w-full rounded-[8px] px-2 py-1 text-left text-xs transition-colors hover:bg-white/[0.06]">
                    <span className="font-mono text-link">{`{{${k.key}}}`}</span> <span className="text-fg-2">{k.describes}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  )
}
