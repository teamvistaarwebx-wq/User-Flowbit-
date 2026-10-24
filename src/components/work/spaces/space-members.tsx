'use client'

import { Crown, LogOut, UserMinus, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { addSpaceMembers, removeSpaceMember } from '@/modules/work/spaces/actions'
import { useAction } from '@/components/ui/action-form'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PeoplePicker } from '../tasks/people-picker'
import type { Person } from '../tasks/types'

/** Space members: add (owner), remove (owner), leave (anyone but the creator). */
export function SpaceMembers({ spaceId, spaceName, memberIds, creatorId, people, me, canManage }: { spaceId: string; spaceName: string; memberIds: string[]; creatorId: string; people: Person[]; me: string; canManage: boolean }) {
  const router = useRouter()
  const [picked, setPicked] = useState<string[]>([])
  const [add, adding] = useAction(addSpaceMembers, { onDone: () => setPicked([]) })
  const byId = new Map(people.map((p) => [p.id, p]))
  const candidates = people.filter((p) => p.active && !memberIds.includes(p.id))

  return (
    <div className="space-y-4">
      {canManage ? (
        <PeoplePicker
          people={candidates}
          value={picked}
          onChange={setPicked}
          onOpenChange={(open) => !open && picked.length && void add({ id: spaceId, memberIds: picked })}
          emptyLabel="Everyone is already here"
          trigger={<Button variant="primary" size="sm" icon={<UserPlus className="size-4" />} loading={adding}>Add people</Button>}
        />
      ) : null}
      <ul className="-mx-2">
        {memberIds.map((id) => {
          const person = byId.get(id)
          const isCreator = id === creatorId
          const isMe = id === me
          return (
            <li key={id} className="flex min-h-12 items-center gap-3 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
              <Avatar name={person?.name} src={person?.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
                  {person?.name ?? 'Former member'} {isCreator ? <Crown className="size-3.5 text-fg-2" aria-label="Creator" /> : null}
                </p>
                <p className="truncate text-[13px] text-[#959596]">{[person?.title, person?.department].filter(Boolean).join(' · ') || person?.email}</p>
              </div>
              {!isCreator && (canManage || isMe) ? (
                <ConfirmDialog
                  trigger={<Button variant="ghost" size="sm" icon={isMe ? <LogOut className="size-3.5" /> : <UserMinus className="size-3.5" />}>{isMe ? 'Leave' : 'Remove'}</Button>}
                  title={isMe ? `Leave ${spaceName}?` : `Remove ${person?.name ?? 'this person'} from ${spaceName}?`}
                  description={isMe ? 'You will only see your own tasks in it afterwards.' : 'Their tasks stay; they just lose full access to the space.'}
                  confirmLabel={isMe ? 'Leave space' : 'Remove'}
                  onConfirm={async () => {
                    const res = await removeSpaceMember({ id: spaceId, memberId: id })
                    if (res.ok && res.redirect) router.push(res.redirect)
                    return res
                  }}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
