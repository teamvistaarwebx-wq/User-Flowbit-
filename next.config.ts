import type { NextConfig } from 'next'
import { vercelHostRedirects } from './src/lib/host-redirect'
import { legacyRedirects } from './src/lib/legacy-routes'
import { parseMaxUploadMb } from './src/lib/upload-limit'

/** Upload cap in MB: 10 locally, 4 on Vercel when unset (it refuses bodies over ~4.5 MB). Inlined for the browser below. */
const maxUploadMb = parseMaxUploadMb(process.env.MAX_UPLOAD_MB)

/** HSTS only where the site is served over https (every Vercel deployment; APP_URL https elsewhere). */
const isHttps = process.env.VERCEL === '1' || (process.env.APP_URL ?? '').startsWith('https://')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Same-origin framing stays allowed: task attachments preview PDFs in an iframe.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), usb=(), browsing-topics=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")' },
  ...(isHttps ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
]

/**
 * PDFs (invoices, payslips, letters, statements, subscription invoices) are
 * rendered in route handlers and in server actions on many pages, and
 * lib/pdf/base.tsx reads the Work Sans files at runtime. Ship them with every
 * server function that can render a PDF.
 */
const PDF_FONTS = ['./node_modules/@fontsource/work-sans/files/work-sans-latin-{400,500,600,700}-normal.woff', './assets/fonts/noto-sans-devanagari/*.ttf']

const nextConfig: NextConfig = {
  // A separate output folder lets a verification build run while `next start` serves .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // 127.0.0.1 and localhost are different origins to Next; allow both so client chunks hydrate.
  allowedDevOrigins: ['127.0.0.1', 'localhost', '[::1]'],
  // The dev badge sits bottom-left, right over the rail's Settings item; build errors still open the overlay.
  devIndicators: false,
  // Loaded from node_modules at runtime instead of bundled (react-pdf ships fonts and WASM; mongoose has native-style deps).
  serverExternalPackages: ['@react-pdf/renderer', 'mongoose'],
  outputFileTracingIncludes: {
    '/api/**': PDF_FONTS,
    '/app/**': PDF_FONTS,
    // The manual pages are prerendered at build; this keeps them working if one is ever rendered on demand.
    '/manual/**': ['./content/manual/*.html'],
    '/platform/**': PDF_FONTS,
  },
  env: { MAX_UPLOAD_MB: String(maxUploadMb) },
  experimental: {
    // Uploads (documents, receipts, logos) travel with their server action: the cap plus room for the other fields.
    serverActions: { bodySizeLimit: `${Math.ceil(maxUploadMb) + 1}mb` },
  },
  poweredByHeader: false,
  // An explicit (empty) Turbopack config: Turbopack builds (Vercel) ignore the webpack hook below instead of failing on it.
  turbopack: {},
  // Local dev runs webpack (the exFAT drive cannot run Turbopack). Webpack cannot read the `node:` scheme in the
  // proxy bundle (proxy -> domains/portal-host -> lib/db -> lib/env -> lib/secret-box imports node:crypto),
  // so `node:x` is read as the same built-in `x`. The edge copy of instrumentation.ts also reaches secret-box
  // (behind its NEXT_RUNTIME === 'nodejs' guard, so it never runs there): crypto is an empty module outside Node.
  webpack(config, { webpack, nextRuntime }) {
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
        resource.request = resource.request.replace(/^node:/, '')
      }),
    )
    if (nextRuntime !== 'nodejs') config.resolve.fallback = { ...config.resolve.fallback, crypto: false }
    return config
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  // Production on its own domain: *.vercel.app page visits go to APP_URL (sessions and Google sign-in live there).
  // Renamed and merged app routes keep their old paths working (src/lib/legacy-routes.ts).
  async redirects() {
    return [...vercelHostRedirects(process.env), ...legacyRedirects()]
  },
}

export default nextConfig
