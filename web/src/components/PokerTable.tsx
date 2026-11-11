/** Стіл: сіти формату по колу, герой завжди внизу по центру. */

import { TABLES } from '../engine/tables'
import type { Position, SeatAction, Spot, TableId } from '../engine/types'

/** Що показати під сітом: підпис дії, її CSS-клас і чи гравець уже поза роздачею. */
export interface SeatView {
  readonly label: string
  readonly cls: string
  readonly folded: boolean
}

const EMPTY: SeatView = { label: '', cls: '', folded: false }

/** Підпис і CSS-клас дії на сіті. */
const SEAT_TEXT: Readonly<Record<SeatAction, readonly [string, string]>> = {
  fold: ['Фолд', ''],
  limp: ['Лімп 1bb', 'limp'],
  raise: ['Рейз 3bb', 'raise'],
  // Розміри 3- і 4-бету залежать від позицій — вони в тексті споту.
  '3bet': ['3-бет', 'threebet'],
  '4bet': ['4-бет', 'threebet'],
}

/**
 * Сам стіл без знання, звідки дані: префлоп і постфлоп описують сіти
 * по-різному, а малюється це однаково.
 */
export function Felt({
  table,
  heroPos,
  potBB,
  seat,
}: {
  table: TableId
  heroPos: Position
  potBB: number
  seat: (pos: Position) => SeatView
}) {
  const seats = TABLES[table].seats
  const n = seats.length
  const start = seats.indexOf(heroPos)

  return (
    <div className="felt-wrap">
      <div className="felt">
        <div className="pot">
          Банк<b>{potBB} bb</b>
        </div>
      </div>
      {Array.from({ length: n }, (_, i) => {
        const pos = seats[(start + i) % n] as Position
        // i=0 → 90° → низ по центру: герой завжди перед гравцем.
        const ang = ((90 + (i * 360) / n) * Math.PI) / 180
        const v = seat(pos)
        return (
          <div
            key={pos}
            className={`seat${i === 0 ? ' hero' : ''}${v.folded ? ' folded' : ''}`}
            style={{
              left: `${50 + 43 * Math.cos(ang)}%`,
              top: `${50 + 40 * Math.sin(ang)}%`,
            }}
          >
            <div className="lbl">
              {pos}
              {pos === 'BTN' && <span className="btn-chip">D</span>}
            </div>
            <div className={`act ${v.cls}`}>{v.label}</div>
          </div>
        )
      })}
    </div>
  )
}

export function PokerTable({ spot }: { spot: Spot }) {
  // Формат споту, а не перемикача: стіл малює те, що роздано.
  return (
    <Felt
      table={spot.table}
      heroPos={spot.heroPos}
      potBB={spot.potBB}
      seat={(pos) => {
        const action = spot.seats[pos]
        if (!action) return EMPTY
        const [label, cls] = SEAT_TEXT[action]
        return { label, cls, folded: action === 'fold' }
      }}
    />
  )
}
