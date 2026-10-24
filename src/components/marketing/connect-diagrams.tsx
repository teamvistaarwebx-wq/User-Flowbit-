type Node = { label: string; color: string }

const W = 300
const H = 160

/** A node as the Figma chip: a #171717 pill with a translucent hairline; the shared record is the violet "selected" chip. */
function Pill({ x, y, node, strong }: { x: number; y: number; node: Node; strong?: boolean }) {
  const width = Math.max(72, node.label.length * 6.6 + 24)
  return (
    <g>
      <rect x={x - width / 2} y={y - 14} width={width} height={28} rx={14} fill={strong ? '#56397D' : '#171717'} stroke="#FFFFFF" strokeOpacity={strong ? 0.22 : 0.16} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={500} fill="#FFFFFF">{node.label}</text>
    </g>
  )
}

/** One record in the middle, three products reading it. */
export function HubDiagram({ center, spokes, title }: { center: Node; spokes: [Node, Node, Node]; title: string }) {
  const c = { x: W / 2, y: H / 2 }
  const points = [{ x: 62, y: 28 }, { x: W - 62, y: 28 }, { x: W / 2, y: H - 20 }]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
      {points.map((p, i) => (
        <line key={i} x1={c.x} y1={c.y} x2={p.x} y2={p.y} stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth={1.25} strokeDasharray="3 4" />
      ))}
      {points.map((p, i) => <Pill key={spokes[i].label} x={p.x} y={p.y} node={spokes[i]} />)}
      <Pill x={c.x} y={c.y} node={center} strong />
    </svg>
  )
}

/** Left to right: one thing feeds the next. */
export function ChainDiagram({ nodes, title }: { nodes: [Node, Node, Node]; title: string }) {
  const ys = [36, H / 2, H - 36]
  const xs = [74, W / 2, W - 74]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
      <defs>
        <marker id="chain-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" fill="rgba(255,255,255,0.5)" />
        </marker>
      </defs>
      {[0, 1].map((i) => (
        <path key={i} d={`M${xs[i] + 20} ${ys[i] + 16} Q ${xs[i] + 60} ${ys[i] + 20} ${xs[i + 1] - 22} ${ys[i + 1] - 16}`} fill="none" stroke="#FFFFFF" strokeOpacity={0.3} strokeWidth={1.25} strokeDasharray="3 4" markerEnd="url(#chain-arrow)" />
      ))}
      {nodes.map((n, i) => <Pill key={n.label} x={xs[i]} y={ys[i]} node={n} strong={i === 2} />)}
    </svg>
  )
}
