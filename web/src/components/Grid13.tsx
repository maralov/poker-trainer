/** Сітка 13×13: над діагоналлю suited, під нею offsuit, по діагоналі пари. */

import { handAt } from '../engine/cards'
import type { Hand, RangePair } from '../engine/types'

export function Grid13({
  ranges,
  highlight = null,
  compact = false,
}: {
  ranges: RangePair
  highlight?: Hand | null
  compact?: boolean
}) {
  const cells = []
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const h = handAt(i, j)
      const kind = ranges.raise.has(h) ? ' raise' : ranges.call.has(h) ? ' call' : ''
      cells.push(
        <div
          key={h}
          className={`cell${kind}${i === j ? ' pair' : ''}${h === highlight ? ' hi' : ''}`}
        >
          {h}
        </div>,
      )
    }
  }
  return <div className={`grid${compact ? ' compact' : ''}`}>{cells}</div>
}
