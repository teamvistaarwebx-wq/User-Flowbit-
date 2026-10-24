/** The chart's numbers as a visually hidden table, for screen readers (the drawing itself is one `role="img"`). */
export function ChartDataTable({ caption, labels, series, formatValue }: { caption: string; labels: string[]; series: { name: string; data: number[] }[]; formatValue: (v: number) => string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          {series.map((s) => (
            <th key={s.name} scope="col">{s.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((label, i) => (
          <tr key={`${label}-${i}`}>
            <th scope="row">{label}</th>
            {series.map((s) => (
              <td key={s.name}>{formatValue(s.data[i] ?? 0)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
