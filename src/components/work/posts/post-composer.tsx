'use client'

import { useCallback, useState } from 'react'
import { Send } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { createPost, updatePost } from '@/modules/work/posts/actions'
import type { GroupOptions } from '@/modules/work/posts/audience'
import { POST_TYPE_META, pickableTypes, type PostType } from '@/modules/work/posts/post-types'
import { PeoplePicker, type PickPerson } from '../teams/people-picker'
import { attachPostGif, uploadPostImage } from '@/modules/work/posts/image-actions'
import { ImageDraftStrip, ImagePickButton } from '../media/image-draft'
import { MAX_INLINE_IMAGES } from '@/lib/inline-images'
import { useImageUploads } from '../media/use-image-uploads'
import { AudienceFields, EventFields, PollFields, ScheduleField, TypePicker } from './composer-parts'
import { PostTypeBadge } from './post-type-icon'
import { GifPicker } from './gif-picker'

export type ComposerPost = {
  id: string
  title: string
  message: string
  type: PostType
  priority: string
  audience: string
  targetRoles: string[]
  targetTeamIds: string[]
  targetDepartments: string[]
  targetLocations: string[]
  mentionIds: string[]
  featured: { id: string }[]
  expiresOn?: string
  scheduledFor?: string
  event?: { startsAt: string; place?: string }
}

const FEATURED_LABEL: Partial<Record<PostType, string>> = { kudos: 'Kudos for', welcome: 'Who joined', celebration: 'Who it celebrates' }

/** ISO instant -> 'YYYY-MM-DDTHH:MM' in IST for datetime-local inputs. */
const istLocal = (iso?: string) => (iso ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16) : undefined)

/**
 * New post or edit. The type decides the extra fields: people for kudos and welcomes, options for a poll, a
 * date and place for an event, priority and expiry for an announcement. Any post can target an audience and
 * be scheduled. An edit keeps the type, poll and images.
 */
export function PostComposer({ people, groups, canAnnounce, post, onDone, gifSearch = false, initialType }: { people: PickPerson[]; groups: GroupOptions; canAnnounce: boolean; post?: ComposerPost; onDone?: () => void; gifSearch?: boolean; initialType?: PostType }) {
  const [type, setType] = useState<PostType>(post?.type ?? initialType ?? 'update')
  const [mentions, setMentions] = useState<string[]>(post?.mentionIds ?? [])
  const [featured, setFeatured] = useState<string[]>(post?.featured.map((f) => f.id) ?? [])
  const images = useImageUploads(useCallback((file: File) => {
    const form = new FormData()
    form.set('file', file)
    return uploadPostImage(form)
  }, []))
  const types = pickableTypes(canAnnounce).filter((t) => !POST_TYPE_META[t].automatic)
  const featuredLabel = FEATURED_LABEL[type]
  const reset = () => {
    if (post) return
    setMentions([])
    setFeatured([])
    images.clear()
  }

  return (
    <ActionForm action={post ? updatePost : createPost} onDone={() => { reset(); onDone?.() }} resetOnSuccess={!post} className="space-y-5">
      {post ? (
        <>
          <input type="hidden" name="id" value={post.id} />
          <input type="hidden" name="category" value={post.type} />
          <PostTypeBadge type={post.type} />
        </>
      ) : (
        <TypePicker types={types} value={type} onChange={setType} />
      )}
      <div className="space-y-3">
        <FormField name="title" label="Title" required>
          <Input id="title" name="title" defaultValue={post?.title} maxLength={200} placeholder={type === 'poll' ? 'What are you asking?' : 'What is this about?'} />
        </FormField>
        <FormField name="message" label="Message" required>
          <Textarea id="message" name="message" rows={4} maxLength={5000} defaultValue={post?.message} placeholder="Plain text; line breaks are kept." />
        </FormField>
      </div>
      {featuredLabel ? (
        <FormField name="featuredIds" label={featuredLabel} required={type !== 'celebration'} help={type === 'kudos' ? 'They and their manager hear about it.' : undefined}>
          <PeoplePicker name="featuredIds" people={people} value={featured} onChange={setFeatured} placeholder="Pick people" />
        </FormField>
      ) : null}
      {type === 'poll' && !post ? <div className="grid gap-4 sm:grid-cols-3"><PollFields /></div> : null}
      {type === 'event' ? <div className="grid gap-4 sm:grid-cols-3"><EventFields startsAt={istLocal(post?.event?.startsAt)} place={post?.event?.place} /></div> : null}
      {post ? null : (
        <>
          {images.ids.map((id) => <input key={id} type="hidden" name="imageIds[]" value={id} />)}
          <ImageDraftStrip drafts={images.drafts} onRemove={images.remove} />
        </>
      )}
      <FormField name="mentionIds" label="Mention people" help="They get a notification, whatever the audience.">
        <PeoplePicker name="mentionIds" people={people} value={mentions} onChange={setMentions} placeholder="Mention someone" />
      </FormField>
      <fieldset className="grid gap-4 rounded-[12px] bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.06] sm:grid-cols-3 sm:p-4">
        <legend className="sr-only">Who sees it and when</legend>
        <AudienceFields groups={groups} defaults={post ?? {}} />
        {type === 'announcement' ? (
          <>
            <FormField name="priority" label="Priority">
              <Select name="priority" defaultValue={post?.priority ?? 'medium'} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]} />
            </FormField>
            <FormField name="expiresOn" label="Show until" help="Optional">
              <DateInput id="expiresOn" name="expiresOn" defaultValue={post?.expiresOn} />
            </FormField>
          </>
        ) : null}
        {!post || post.scheduledFor ? <ScheduleField defaultAt={istLocal(post?.scheduledFor)} /> : null}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        {post ? <span /> : (
          <div className="flex items-center gap-1.5 text-xs text-fg-3">
            <ImagePickButton onFiles={images.add} count={images.drafts.length} />
            {gifSearch ? <GifPicker disabled={images.drafts.length >= MAX_INLINE_IMAGES} onPick={(g) => images.addFrom(g.title, g.previewUrl, () => attachPostGif({ url: g.url, title: g.title }))} /> : null}
            <span className="hidden sm:inline">{gifSearch ? 'Images or GIFs' : 'Images or GIFs (JPEG, PNG, GIF, WebP)'}</span>
          </div>
        )}
        <SubmitButton icon={<Send className="size-4" />} disabled={images.uploading} pendingLabel={post ? 'Saving…' : 'Posting…'} className="w-full sm:w-auto">{post ? 'Save post' : 'Post'}</SubmitButton>
      </div>
    </ActionForm>
  )
}
