/** Стіл: 9 сітів по колу, герой завжди внизу по центру. */

import { ACTION_ORDER, type Position, type SeatAction, type Spot } from '../engine/types'

/** Підпис і CSS-клас дії на сіті. */
const SEAT_TEXT: Readonly<Record<SeatAction, readonly [string, string]>> = {
  fold: ['Фолд', ''],
  limp: ['Лімп 1bb', 'limp'],
  raise: ['Рейз 3bb', 'raise'],
  '3bet': ['3-бет 10bb', 'threebet'],
}

export function PokerTable({ spot }: { spot: Spot }) {
  const start = ACTION_ORDER.indexOf(spot.heroPos)

  return (
    <div className="felt-wrap">
      <div className="felt">
        <div className="pot">
          Банк<b>{spot.potBB} bb</b>
        </div>
      </div>
      {Array.from({ length: 9 }, (_, i) => {
        const pos = ACTION_ORDER[(start + i) % 9] as Position
        // i=0 → 90° → низ по центру: герой завжди перед гравцем.
        const ang = ((90 + i * 40) * Math.PI) / 180
        const action = spot.seats[pos]
        const [label, cls] = action ? SEAT_TEXT[action] : ['', '']
        return (
          <div
            key={pos}
            className={`seat${i === 0 ? ' hero' : ''}${action === 'fold' ? ' folded' : ''}`}
            style={{
              left: `${50 + 43 * Math.cos(ang)}%`,
              top: `${50 + 40 * Math.sin(ang)}%`,
            }}
          >
            <div className="lbl">
              {pos}
              {pos === 'BTN' && <span className="btn-chip">D</span>}
            </div>
            <div className={`act ${cls}`}>{label}</div>
          </div>
        )
      })}
    </div>
  )
}
