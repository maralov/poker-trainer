export interface StatCell {
  readonly value: string | number
  readonly label: string
  /** Моноширинний варіант — для довгих значень на кшталт списку позицій. */
  readonly mono?: boolean
}

export function StatStrip({ cells, style }: { cells: readonly StatCell[]; style?: React.CSSProperties }) {
  return (
    <div className="strip" style={style}>
      {cells.map((c) => (
        <div className="sc" key={c.label}>
          <b className={c.mono ? 'mono' : undefined}>{c.value}</b>
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Плитка «позиція / точність», з підсвіткою при достатній вибірці. */
export function PerPos({
  items,
}: {
  items: readonly { name: string; acc: number | null; t: number; min: number }[]
}) {
  return (
    <div className="perpos">
      {items.map((it) => {
        const cls =
          it.acc === null || it.t < it.min ? '' : it.acc < 80 ? ' warn' : ' good'
        return (
          <div className={`pp${cls}`} key={it.name}>
            <b>{it.name}</b>
            <span>{it.acc === null ? '—' : `${it.acc}% · ${it.t}`}</span>
          </div>
        )
      })}
    </div>
  )
}
