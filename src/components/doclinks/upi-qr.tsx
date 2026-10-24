import type { UpiPay } from '@/modules/doclinks/view-types'

/** The UPI QR as inline SVG on white (scanners need the contrast), with the UPI ID under it. */
export function UpiQr({ upi, amountLabel }: { upi: UpiPay; amountLabel: string }) {
  const quiet = 2
  const size = upi.qrSize + quiet * 2
  return (
    <figure className="flex flex-col items-center gap-2">
      <svg viewBox={`${-quiet} ${-quiet} ${size} ${size}`} className="size-44 rounded-xl bg-white p-1" role="img" aria-label={`UPI QR code to pay ${amountLabel} to ${upi.vpa}`} shapeRendering="crispEdges">
        <path d={upi.qrPath} fill="#000" />
      </svg>
      <figcaption className="text-center text-xs text-white/70">
        Scan with any UPI app to pay {amountLabel}
        <br />
        <span className="font-mono text-white/90">{upi.vpa}</span>
      </figcaption>
      <a href={upi.intent} className="text-xs font-medium text-white underline underline-offset-4 sm:hidden">
        Open a UPI app
      </a>
    </figure>
  )
}
