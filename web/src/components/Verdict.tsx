/** Вердикт після відповіді: правильна дія, пояснення і підсвічена сітка. */

import { DRILL } from '../engine/drill'
import { actionName } from '../engine/spots'
import type { Spot } from '../engine/types'
import { Grid13 } from './Grid13'
import { RangeLegend } from './RangeLegend'

export function Verdict({
  spot,
  ok,
  handStreak,
  onNext,
}: {
  spot: Spot
  ok: boolean
  handStreak: number
  onNext: () => void
}) {
  return (
    <div className={`verdict ${ok ? 'ok' : 'no'}`}>
      <h3>
        {ok ? 'Правильно' : 'Помилка'}
        {spot.drill && (
          <span className="tagctl">
            {spot.isControl ? 'контроль' : `лік · серія ${handStreak}/${DRILL.retire}`}
          </span>
        )}
      </h3>
      <p>
        {spot.hand} на {spot.heroPos} — <strong>{actionName(spot.correct, spot.scen)}</strong>.{' '}
        {spot.explainExtra}
      </p>
      <Grid13 ranges={spot.ranges} highlight={spot.hand} compact />
      {/* Сітка без легенди — просто кольорові плями: на цьому екрані підписи
          клітинок стискаються до 6px, тож колір лишається єдиним, що читається.
          Пункт «твоя рука» тут є, а на вкладці «Діапазони» його нема, бо
          підсвітка існує тільки у вердикті. */}
      <RangeLegend
        action={actionName('raise', spot.scen)}
        hasCall={spot.ranges.call.size > 0}
        hasHighlight
        compact
      />
      <button type="button" className="next" onClick={onNext}>
        Далі · пробіл
      </button>
    </div>
  )
}
