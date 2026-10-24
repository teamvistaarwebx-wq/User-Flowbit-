'use client'

import { useState } from 'react'
import { Play, Volume2, Waves } from 'lucide-react'
import { setMotionPrefAction } from '@/lib/core-actions'
import { play, useSoundPref, type SoundName } from '@/lib/sound'
import { toast } from '@/lib/toast'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { RadioCards } from '@/components/ui/radio-cards'
import { Switch } from '@/components/ui/switch'

type SoundTest = Readonly<{ id: string; name: SoundName; label: string; when: string; on?: boolean }>

const SOUND_TESTS: readonly SoundTest[] = [
  { id: 'click', name: 'click', label: 'Click', when: 'A real action, like Save or Approve. Links and tabs stay quiet.' },
  { id: 'toggle-on', name: 'toggle', on: true, label: 'Toggle on', when: 'A switch, chip or checkbox turned on' },
  { id: 'toggle-off', name: 'toggle', on: false, label: 'Toggle off', when: 'The same control turned off' },
  { id: 'pop', name: 'pop', label: 'Pop', when: 'A dialog or menu opens' },
  { id: 'success', name: 'success', label: 'Success', when: 'A save worked' },
  { id: 'error', name: 'error', label: 'Error', when: 'Something was refused' },
  { id: 'notify', name: 'notify', label: 'Notify', when: 'A new notification arrives' },
  { id: 'whoosh', name: 'whoosh', label: 'Whoosh', when: 'Finishing setup or switching workspace' },
]

type Motion = 'system' | 'reduce' | 'full'

export function AppearanceSettings({ motion: initialMotion }: { motion: Motion }) {
  const [soundOn, setSoundOn] = useSoundPref()
  const [motion, setMotion] = useState<Motion>(initialMotion)
  const [saveMotion, savingMotion] = useAction(setMotionPrefAction)

  const toggleSound = async (next: boolean) => {
    await setSoundOn(next)
    toast.message(next ? 'Sounds turned on.' : 'Sounds turned off.')
  }

  const chooseMotion = async (value: string) => {
    const next = value as Motion
    const previous = motion
    setMotion(next)
    const result = await saveMotion({ motion: next })
    if (!result.ok) setMotion(previous)
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card variant="solid" className="col-span-12 xl:col-span-7">
        <CardHeader label="Sound effects" icon={<Volume2 />} description="Quiet, short sounds for actions, saves and notifications. Saved to your account. Independent of the motion setting." />
        <Switch label="Play sound effects" description={soundOn ? 'On in every workspace you use.' : 'Off. Flowbit stays silent.'} checked={soundOn} onCheckedChange={toggleSound} />
        <div className="mt-4 border-t border-line">
          {SOUND_TESTS.map((s) => (
            <div key={s.id} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <p className="text-sm text-white">{s.label}</p>
                <p className="text-xs text-[#959596]">{s.when}</p>
              </div>
              <Button size="sm" variant="ghost" sound={false} disabled={!soundOn} icon={<Play className="size-3.5" />} onClick={() => play(s.name, s.on === undefined ? undefined : { on: s.on })}>
                Test
              </Button>
            </div>
          ))}
        </div>
        {!soundOn ? <p className="mt-3 text-xs text-fg-3">Turn sounds on to hear the test sounds.</p> : null}
      </Card>
      <Card variant="solid" className="col-span-12 h-fit xl:col-span-5">
        <CardHeader label="Motion" icon={<Waves />} description="Gradients drift and cards lift on hover. Reduce it if motion bothers you." />
        <RadioCards
          columns={1}
          value={motion}
          onValueChange={chooseMotion}
          options={[
            { value: 'system', title: 'Match my device', description: 'Follows your operating system setting.', disabled: savingMotion },
            { value: 'reduce', title: 'Reduce motion', description: 'No gradient animation and no hover lift.', disabled: savingMotion },
            { value: 'full', title: 'Full motion', description: 'Always animate, even if your device asks for less.', disabled: savingMotion },
          ]}
        />
      </Card>
    </div>
  )
}
