'use client'

import { Image as ImageIcon, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { LogoUpload } from '@/components/ui/logo-upload'
import { removeProjectLogo, uploadProjectLogo } from '@/modules/work/projects/logo-actions'
import { Card, CardHeader } from '@/components/ui/card'
import type { ClientOption, Person } from '../tasks/types'
import { ProjectForm, type ProjectFormValue } from './project-form'
import { ProjectMenu } from './project-menu'

/** Edit form plus the danger zone (archive / restore / delete). */
export function SettingsTab({ project, logoUrl, people, clients, me, canCreateClient, archived, canDelete }: { project: ProjectFormValue; logoUrl: string | null; people: Person[]; clients: ClientOption[]; me: string; canCreateClient: boolean; archived: boolean; canDelete: boolean }) {
  return (
    <div className="grid grid-cols-12 gap-3">
      <Card variant="solid" className="col-span-12 xl:col-span-8">
        <CardHeader label="Project settings" icon={<SlidersHorizontal />} />
        <ProjectForm project={project} people={people} clients={clients} me={me} canCreateClient={canCreateClient} />
      </Card>
      <div className="col-span-12 space-y-3 self-start xl:col-span-4">
      <Card variant="solid">
        <CardHeader label="Logo" icon={<ImageIcon />} description="JPEG or PNG; it is resized to fit 256 px." />
        <LogoUpload logoUrl={logoUrl} fields={{ projectId: project.id }} upload={uploadProjectLogo} remove={removeProjectLogo} fallback={<span aria-hidden className="size-6 rounded-full" style={{ background: project.color }} />} />
      </Card>
      <Card variant="solid">
        <CardHeader label="Danger zone" icon={<ShieldAlert />} description={archived ? 'This project is archived. Restore it to bring it back to the list.' : 'Archive when the work is finished. Delete only removes empty projects.'} />
        <ProjectMenu id={project.id} name={project.name} archived={archived} canDelete={canDelete} variant="buttons" />
      </Card>
      </div>
    </div>
  )
}
