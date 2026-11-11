/** Стіл: сіти формату по колу, герой завжди внизу по центру. */

import type { ReactNode } from 'react'

import { TABLES } from '../engine/tables'
import type { Position, SeatAction, Spot, TableId } from '../engine/types'

/** Що показати під сітом: підпис дії, її CSS-клас і чи гравець уже поза роздачею. */
export interface SeatView {
  readonly label: string
  readonly cls: string
  readonly folded: boolean
  /** Скільки гравець поставив на поточній вулиці — фішка на сукні перед сітом. */
  readonly bet?: number
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
  center,
  heroCards,
  tall = false,
}: {
  table: TableId
  heroPos: Position
  potBB: number
  seat: (pos: Position) => SeatView
  /** Що лежить на сукні під банком (борд постфлопу). */
  center?: ReactNode
  /** Карти героя — на його сіті, над підписом, як у покер-клієнті. */
  heroCards?: ReactNode
  /** Вертикальний стіл на вузькому екрані: борд на сукні потребує висоти. */
  tall?: boolean
}) {
  const seats = TABLES[table].seats
  const n = seats.length
  const start = seats.indexOf(heroPos)
  const pot = (
    <div className="pot">
      Банк<b>{potBB} bb</b>
    </div>
  )

  return (
    <div className={`felt-wrap${tall ? ' tall' : ''}`}>
      <div className="felt">{!center && pot}</div>
      {center && (
        <div className="felt-center">
          {pot}
          {center}
        </div>
      )}
      {Array.from({ length: n }, (_, i) => {
        const pos = seats[(start + i) % n] as Position
        // i=0 → 90° → низ по центру: герой завжди перед гравцем.
        const ang = ((90 + (i * 360) / n) * Math.PI) / 180
        const v = seat(pos)
        const cos = Math.cos(ang)
        const sin = Math.sin(ang)
        // Фішка на промені від сіта до центру. У героя промінь коротший:
        // між бордом і його сітом лежать його ж карти.
        const k = i === 0 ? 0.45 : 0.68
        return [
          <div
            key={pos}
            className={`seat${i === 0 ? ' hero' : ''}${v.folded ? ' folded' : ''}`}
            style={{ left: `${50 + 43 * cos}%`, top: `${50 + 40 * sin}%` }}
          >
            {i === 0 && heroCards && <div className="hero-cards">{heroCards}</div>}
            <div className="lbl">
              {pos}
              {pos === 'BTN' && <span className="btn-chip">D</span>}
            </div>
            <div className={`act ${v.cls}`}>{v.label}</div>
          </div>,
          v.bet ? (
            <div
              key={`${pos}-bet`}
              className="bet"
              style={{ left: `${50 + 43 * k * cos}%`, top: `${50 + 40 * k * sin}%` }}
            >
              {v.bet}bb
            </div>
          ) : null,
        ]
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
