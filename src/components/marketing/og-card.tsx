import { ImageResponse } from 'next/og'

export const OG_SIZE = { width: 1200, height: 630 }

/** The brand-kit mark (public/brand/flowbit-mark.svg), inlined as paths: Satori takes no ids or CSS classes. */
const MARK_PATHS = [
  'M 3.15 31.46 L 12.49 22.19 C 14.2 23.91 14.19 26.69 12.47 28.39 L 6.24 34.57 Z',
  'M 0 19.91 L 12.78 23.12 C 13.37 20.77 11.94 18.38 9.59 17.79 L 1.07 15.65 Z',
  'M 4.59 7.06 L 16.26 13.14 C 15.14 15.29 12.49 16.12 10.34 15 L 2.56 10.95 Z',
  'M 14.64 0.54 L 15.46 13.69 C 17.88 13.54 19.72 11.46 19.57 9.04 L 19.02 0.27 Z',
  'M 28.5 0.65 L 26.55 13.67 C 24.15 13.31 22.5 11.07 22.86 8.68 L 24.16 0 Z',
  'M 37.93 8.04 L 25.77 13.1 C 26.7 15.33 29.27 16.39 31.5 15.46 L 39.62 12.09 Z',
  'M 41.87 21.5 L 28.91 23.73 C 28.49 21.35 30.1 19.08 32.48 18.67 L 41.13 17.18 Z',
  'M 37.83 32.77 L 29.2 22.82 C 27.37 24.4 27.17 27.17 28.76 29 L 34.51 35.64 Z',
  'M 25.87 40.43 L 19.76 28.78 C 21.91 27.66 24.56 28.48 25.68 30.63 L 29.76 38.4 Z',
  'M 13.9 40.05 L 20.73 28.78 C 18.66 27.52 15.96 28.19 14.7 30.26 L 10.15 37.78 Z',
  'M 25.43 20.86 C 25.43 23.32 23.45 25.3 20.99 25.3 C 18.54 25.3 16.55 23.32 16.55 20.86 C 16.55 18.41 18.54 16.42 20.99 16.42 C 23.45 16.42 25.43 18.41 25.43 20.86 Z',
]

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={(size * 40.43) / 41.87} viewBox="0 0 41.87 40.43">
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} fill="#FFFFFF" />
      ))}
    </svg>
  )
}

/** The Figma sign-in panel's brand mesh (DESIGN 3.1) as CSS layers Satori can paint. */
const MESH = [
  'radial-gradient(circle at 12% 10%, #2A1564 0%, rgba(42,21,100,0) 60%)',
  'radial-gradient(circle at 92% 62%, #CA81B8 0%, rgba(202,129,184,0) 55%)',
  'radial-gradient(circle at 0% 100%, #FCFCFE 0%, rgba(252,252,254,0) 55%)',
  'linear-gradient(160deg, #2E1966 0%, #6A5290 35%, #C58AB9 68%, #E9C9E0 100%)',
].join(', ')

/**
 * Open Graph card as the sign-in screen: the brand mesh on the left with the white lockup and tagline, pure black
 * on the right with the eyebrow, title and line. `accent` is accepted for older callers; the card uses the brand.
 */
export function ogImage({ eyebrow, title, line }: { eyebrow: string; title: string; line: string; accent?: string }) {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#000000', color: '#FFFFFF' }}>
        <div style={{ width: 470, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundImage: MESH }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Mark size={64} />
            <span style={{ fontSize: 60, fontWeight: 600, letterSpacing: -1 }}>Flowbit</span>
          </div>
          <span style={{ marginTop: 18, fontSize: 22 }}>Everything in flow. Nothing in the way</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 64px' }}>
          <span style={{ fontSize: 22, letterSpacing: 2, textTransform: 'uppercase', color: '#CA81B8' }}>{eyebrow}</span>
          <span style={{ marginTop: 20, fontSize: 56, fontWeight: 600, lineHeight: 1.1 }}>{title}</span>
          <span style={{ marginTop: 22, fontSize: 26, color: '#A3A1A4', lineHeight: 1.35 }}>{line}</span>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}
