import type { MetadataRoute } from 'next'

/**
 * Installable PWA (v2 step 6): "Add to Home Screen" opens the signed-in app full screen. No service worker:
 * nothing is cached offline, so authenticated pages are never stored on the device.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flowbit',
    short_name: 'Flowbit',
    description: 'One workspace for tasks and projects, HR and payroll, sales, and billing.',
    id: '/app',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#171717',
    theme_color: '#171717',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Indigo (#210B5D) behind the mark so launchers that crop to a shape show a brand tile, not a black one.
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
