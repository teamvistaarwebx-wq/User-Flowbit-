import './manual.css'

/** The user manual: plain reading pages inside the marketing frame. */
export default function ManualLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6">{children}</div>
}
