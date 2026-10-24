import 'server-only'
import { attendanceImporter, employeesImporter } from './importers/muster'
import { contactsImporter, folioClientsImporter, folioItemsImporter, leadsImporter } from './importers/orbit-folio'
import { teamImporter } from './importers/team'
import { projectsImporter, tasksImporter } from './importers/work'
import type { ImportKind, Importer } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyImporter = Importer<any>

/** Every importer by kind, in the order Settings → Import lists them. */
export const IMPORTERS: Record<ImportKind, AnyImporter> = {
  team: teamImporter,
  employees: employeesImporter,
  attendance: attendanceImporter,
  projects: projectsImporter,
  tasks: tasksImporter,
  leads: leadsImporter,
  contacts: contactsImporter,
  folio_clients: folioClientsImporter,
  folio_items: folioItemsImporter,
}
