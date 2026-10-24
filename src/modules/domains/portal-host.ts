import { hasAddOn } from '@/lib/addons'
import { dbConnect } from '@/lib/db'
import { CustomDomain } from '@/models/integrations/CustomDomain'
import { Org } from '@/models/Org'

/**
 * Portal host → workspace slug for src/proxy.ts (no 'server-only' import, so
 * the proxy can load it).
 *
 * Random Host headers must not cost a database read each, nor push real
 * hosts out of the cache. So, per server instance:
 *  - the set of verified portal hosts is read in one query and kept for
 *    HOSTS_TTL_MS (one refresh at a time). A host outside it is unknown
 *    without any further lookup: that is the negative cache, as short as the
 *    set's lifetime and bounded by the number of verified hosts, not by what
 *    strangers send;
 *  - a known host's slug (the add-on can lapse) is cached for SLUG_TTL_MS in
 *    a map of at most MAX_SLUGS entries that evicts the oldest one at a time.
 * Only verified rows are read, so a pending row never claims a hostname.
 */

const HOSTS_TTL_MS = 30_000
const SLUG_TTL_MS = 60_000
const MAX_SLUGS = 2_000

/** [host, orgId] */
export type HostRow = readonly [string, string]

export type PortalHostSource = Readonly<{
  /** Every verified portal host with its workspace id. */
  verifiedHosts: () => Promise<HostRow[]>
  /** The slug the workspace serves its portal under, or null (gone, or the add-on is off). */
  slugFor: (orgId: string) => Promise<string | null>
}>

const mongoSource: PortalHostSource = {
  async verifiedHosts() {
    await dbConnect()
    const rows = await CustomDomain.find({ kind: 'portal', status: 'verified' }, { domain: 1, orgId: 1 }).lean()
    return rows.map((r): HostRow => [r.domain.toLowerCase(), String(r.orgId)])
  },
  async slugFor(orgId) {
    await dbConnect()
    const org = await Org.findById(orgId).lean()
    return org && hasAddOn(org, 'domains') ? org.slug : null
  },
}

type Snapshot = { hosts: ReadonlyMap<string, string>; at: number }

export function portalHostResolver(source: PortalHostSource = mongoSource, now: () => number = Date.now) {
  let snapshot: Snapshot | null = null
  let loading: Promise<Snapshot> | null = null
  const slugs = new Map<string, { slug: string | null; at: number }>()

  const load = (): Promise<Snapshot> => {
    loading ??= source
      .verifiedHosts()
      .then((rows) => {
        snapshot = { hosts: new Map(rows), at: now() }
        return snapshot
      })
      .finally(() => {
        loading = null
      })
    return loading
  }

  const hosts = async (): Promise<ReadonlyMap<string, string>> => {
    if (snapshot && now() - snapshot.at < HOSTS_TTL_MS) return snapshot.hosts
    return (await load()).hosts
  }

  const remember = (host: string, slug: string | null) => {
    slugs.delete(host)
    slugs.set(host, { slug, at: now() })
    while (slugs.size > MAX_SLUGS) {
      const oldest = slugs.keys().next().value
      if (oldest === undefined) break
      slugs.delete(oldest)
    }
  }

  return {
    /** The workspace slug a verified portal host serves (add-on on); null for unknown hosts. */
    async slugForHost(rawHost: string): Promise<string | null> {
      const host = rawHost.toLowerCase()
      try {
        const orgId = (await hosts()).get(host)
        if (!orgId) return null
        const hit = slugs.get(host)
        if (hit && now() - hit.at < SLUG_TTL_MS) return hit.slug
        const slug = await source.slugFor(orgId)
        remember(host, slug)
        return slug
      } catch (error) {
        console.error('[domains] portal host lookup failed', host, error)
        return null
      }
    },
    /** Forgets a host after it changes, and re-reads the verified set on the next request. */
    forget(rawHost: string) {
      slugs.delete(rawHost.toLowerCase())
      snapshot = null
    },
    /** For tests: how many slugs are cached. */
    cachedSlugs: () => slugs.size,
  }
}

const resolver = portalHostResolver()

export const portalSlugForHost = (host: string) => resolver.slugForHost(host)

/** Forgets a host after it changes on this instance (others pick it up within 30 seconds). */
export const forgetPortalHost = (host: string) => resolver.forget(host)
