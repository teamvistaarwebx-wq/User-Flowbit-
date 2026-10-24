'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Permission, ProductKey, FeatureKey } from '@/lib/catalog'
import type { ShellData } from './data'

type ShellApi = ShellData & {
  can: (perm?: Permission) => boolean
  /** Entitled AND enabled. */
  has: (product: ProductKey) => boolean
  hasFeature: (feature?: FeatureKey) => boolean
  /** Opens the product preview page (/app/locked?product=…) for a product the workspace lacks. */
  openUpgrade: (product: ProductKey) => void
  openCommand: () => void
  /** Absolute link on the public APP_URL for a path, e.g. absoluteUrl('/c/acme/claim'). Use for anything copied or shared. */
  absoluteUrl: (path: string) => string
}

const ShellContext = createContext<ShellApi | null>(null)

export function ShellProvider({ value, children }: { value: ShellApi; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

/** Shell state for client components inside /app: user, org, permissions, products. */
export function useShell(): ShellApi {
  const value = useContext(ShellContext)
  if (!value) throw new Error('useShell must be used inside the app shell')
  return value
}

/** The platform WhatsApp flag (lib/feature-flags) for client components; false outside the app shell. */
export function useWhatsAppOn(): boolean {
  return useContext(ShellContext)?.features.whatsapp ?? false
}
