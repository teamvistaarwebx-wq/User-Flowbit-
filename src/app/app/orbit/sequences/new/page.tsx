import type { Metadata } from 'next'
import { Repeat2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { PageHeader } from '@/components/ui/page-header'
import { SequenceBuilder } from '@/components/orbit/sequence-builder'

export const metadata: Metadata = { title: 'New sequence' }

export default async function NewSequencePage() {
  await requireMember({ product: 'orbit', perm: 'leads.write' })
  return (
    <>
      <PageHeader title="New sequence" description="Up to five steps. Emails send inside the window you set, Monday to Saturday (IST)." breadcrumb={breadcrumbFor('/app/orbit/sequences/new')} icon={<Repeat2 />} />
      <div className="max-w-3xl">
        <SequenceBuilder />
      </div>
    </>
  )
}
