'use client'

import { useState, type CSSProperties } from 'react'
import { Check, Paintbrush, RotateCcw } from 'lucide-react'
import {
  BRAND_COLOR_KEYS,
  BRAND_COLOR_LABELS,
  checkContrast,
  contrastRatio,
  DEFAULT_THEME,
  isDefaultTheme,
  normalizeHex,
  themeVars,
  type BrandColorKey,
  type BrandTheme,
  MIN_TEXT_CONTRAST,
  MIN_UI_CONTRAST,
  type ContrastCheck,
  type ContrastLevel,
  presetOf,
  THEME_PRESETS,
} from '@/lib/brand-theme'
import { cn } from '@/lib/utils'
import { resetBrandColors, saveBrandColors } from '@/modules/settings/appearance-actions'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const LEVEL_CLASS: Record<ContrastLevel, string> = { good: 'text-success', ui_only: 'text-warning', poor: 'text-danger' }

type Props = { initial: BrandTheme; allowed: boolean; planNote: string }

/**
 * The secondary colour is a fill behind white text (selected chips, the rail), so it is judged against white,
 * not against the dark page like the primary and accent colours, which are used as text.
 */
function checkUnderWhite(hex: string): ContrastCheck {
  const ratio = contrastRatio(hex, '#ffffff')
  const rounded = Math.round(ratio * 10) / 10
  if (ratio >= MIN_TEXT_CONTRAST) return { ratio: rounded, level: 'good', message: `${rounded}:1 with white text. Readable.` }
  if (ratio >= MIN_UI_CONTRAST) return { ratio: rounded, level: 'ui_only', message: `${rounded}:1 with white text. Fine for large labels; pick a deeper shade for small text.` }
  return { ratio: rounded, level: 'poor', message: `${rounded}:1 with white text. Too light; pick a deeper shade.` }
}

function ColorField({ name, value, onChange }: { name: BrandColorKey; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const meta = BRAND_COLOR_LABELS[name]
  const hex = normalizeHex(draft)
  const contrast = name === 'secondary' ? checkUnderWhite(hex ?? value) : checkContrast(hex ?? value)
  const commit = (next: string) => {
    setDraft(next)
    const parsed = normalizeHex(next)
    if (parsed) onChange(parsed)
  }
  return (
    <div className="flex items-start gap-3 rounded-[10px] bg-white/[0.04] p-3">
      <label className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-[8px] ring-1 ring-inset ring-white/20 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link" style={{ background: value }}>
        <span className="sr-only">Pick the {meta.label.toLowerCase()} colour</span>
        <input type="color" value={value} onChange={(e) => commit(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-white">{meta.label}</p>
          <Input aria-label={`${meta.label} hex`} value={draft} onChange={(e) => commit(e.target.value)} onBlur={() => setDraft(value)} inputSize="sm" className="w-28 font-mono uppercase" maxLength={7} />
        </div>
        <p className="text-xs text-[#959596]">{meta.use}</p>
        <p className={cn('mt-1 text-xs', hex ? LEVEL_CLASS[contrast.level] : 'text-danger')}>{hex ? contrast.message : 'Use a hex colour like #BB62A5'}</p>
      </div>
    </div>
  )
}

/**
 * A small slice of the shell drawn with the draft colours: the wordmark, the rail with its white active tab, a
 * greeting, the primary button, a selected chip beside the segmented track, the thick workday bar and a link.
 */
function Preview({ theme }: { theme: BrandTheme }) {
  return (
    <div className="overflow-hidden rounded-[10px] bg-bg ring-1 ring-inset ring-white/10" style={themeVars(theme) as CSSProperties}>
      <div className="flex h-9 items-center border-b border-line px-3">
        <span className="text-gradient text-sm font-semibold">Flowbit</span>
      </div>
      <div className="flex">
        <div className="relative flex w-12 shrink-0 flex-col items-center gap-3.5 rounded-bl-[8px] bg-grad-rail py-3.5">
          <span aria-hidden className="absolute left-0 top-3 h-6 w-1.5 rounded-r-[4px] bg-white" />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn('size-4 rounded-[4px] border-[1.5px]', i === 0 ? 'border-white' : 'border-white/45')} />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-3.5">
          <p className="text-[15px] font-medium text-white">
            Good morning, <span className="text-blush">team</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-grad-button px-3.5 py-1.5 text-xs font-medium text-white">New invoice</span>
            <span className="flex items-center gap-0.5 rounded-full bg-control p-[3px] text-xs">
              <span className="rounded-full bg-chip-active px-2.5 py-1 text-white">This month</span>
              <span className="px-2.5 py-1 text-white/80">Last month</span>
            </span>
          </div>
          <div className="h-6 w-full overflow-hidden rounded-[6px] bg-white/[0.14]">
            <div className="h-full w-[64%] rounded-[6px] bg-grad-progress" />
          </div>
          <p className="text-xs text-fg-2">
            <span className="font-medium text-orchid">View report</span> · 3 due today
          </p>
        </div>
      </div>
    </div>
  )
}

/** The presets gallery: each palette as three swatches; "Custom" lights up once a colour is changed by hand. */
function PresetGallery({ theme, disabled, onPick }: { theme: BrandTheme; disabled: boolean; onPick: (theme: BrandTheme) => void }) {
  const active = presetOf(theme)
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs text-[#959596]">Presets</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme presets">
        {THEME_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={active === p.key}
            disabled={disabled}
            onClick={() => onPick(p.theme)}
            className={cn('press inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs text-white transition-colors disabled:opacity-50', active === p.key ? 'border-white/60 bg-white/[0.08]' : 'border-white/[0.12] hover:bg-white/[0.05]')}
          >
            <span className="flex -space-x-1" aria-hidden>
              {BRAND_COLOR_KEYS.map((k) => <span key={k} className="size-3.5 rounded-full ring-1 ring-black/40" style={{ background: p.theme[k] }} />)}
            </span>
            {p.label}
          </button>
        ))}
        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1.5 text-xs', active ? 'border-white/[0.08] text-fg-3' : 'border-white/60 bg-white/[0.08] text-white')}>Custom</span>
      </div>
    </div>
  )
}

/** Settings → Appearance, workspace section: brand colours with presets, live preview, contrast check and reset. */
export function BrandColorsForm({ initial, allowed, planNote }: Props) {
  const [theme, setTheme] = useState<BrandTheme>(initial)
  const [fieldsKey, setFieldsKey] = useState(0)
  const [save, saving] = useAction(saveBrandColors)
  const [reset, resetting] = useAction(resetBrandColors, {
    onDone: () => {
      setTheme(DEFAULT_THEME)
      setFieldsKey((k) => k + 1)
    },
  })
  const dirty = BRAND_COLOR_KEYS.some((k) => theme[k] !== initial[k])
  const showDefaults = () => {
    setTheme(DEFAULT_THEME)
    setFieldsKey((k) => k + 1)
  }
  // Nothing saved yet: resetting only clears the draft. Saved colours: remove them for everyone.
  const onReset = () => (isDefaultTheme(initial) ? showDefaults() : void reset({}))

  return (
    <Card variant="solid" className="col-span-12">
      <CardHeader
        label="Brand colours"
        icon={<Paintbrush />}
        description="Your workspace's colours on buttons, active states, gradients and charts, for everyone in it."
        actions={<span className={cn('text-xs font-medium', allowed ? 'text-mint' : 'text-warning')}>{planNote}</span>}
      />
      <PresetGallery
        theme={theme}
        disabled={!allowed}
        onPick={(next) => {
          setTheme(next)
          setFieldsKey((k) => k + 1)
        }}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div key={fieldsKey} className="space-y-2.5">
          {BRAND_COLOR_KEYS.map((key) => (
            <ColorField key={key} name={key} value={theme[key]} onChange={(value) => setTheme((t) => ({ ...t, [key]: value }))} />
          ))}
        </div>
        <div className="space-y-3">
          <Preview theme={theme} />
          <p className="text-xs text-[#959596]">Aim for green on the primary and accent colours: they carry links and small text. The secondary colour sits behind white text, so a deeper shade works best.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" icon={<RotateCcw className="size-4" />} loading={resetting} disabled={!allowed || (isDefaultTheme(initial) && isDefaultTheme(theme))} onClick={onReset}>
          Reset to Flowbit colours
        </Button>
        <Button variant="primary" icon={<Check className="size-4" />} loading={saving} disabled={!allowed || !dirty} onClick={() => save(theme)}>
          Save colours
        </Button>
      </div>
    </Card>
  )
}
