/** Every stored file a project owns (attachments and its logo), so deleting the project leaves no orphans. Pure. */
export function projectStoredFileIds(project: { files?: readonly { fileId: unknown }[] | null; logoFileId?: unknown }): string[] {
  const ids = (project.files ?? []).map((f) => String(f.fileId))
  return project.logoFileId ? [...ids, String(project.logoFileId)] : ids
}
