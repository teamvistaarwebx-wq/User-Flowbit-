/**
 * Runs an async loader at most once and shares its promise: one page render can
 * hand the same expensive query to several helpers without running it twice.
 */
export function onceAsync<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= load()
    return pending
  }
}
