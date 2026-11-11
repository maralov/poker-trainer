/**
 * Drill-бар постфлопу: відкриті патерни помилок, серія поточного і кнопка
 * запуску/виходу. Та сама плашка, що в префлопі, щоб drill виглядав однаково
 * в обох етапах.
 */

import { POST_DRILL, POST_FIX, postDrillPool } from '../engine/postflop'
import { usePostSessionStore } from '../store/postSessionStore'
import { usePostStatsSource } from '../store/postStatsSource'

export function PostDrillBar() {
  // Пул має враховувати помилки й серії з усіх пристроїв.
  const post = usePostStatsSource().progress
  const drillOn = usePostSessionStore((s) => s.drillOn)
  const target = usePostSessionStore((s) => s.drillTarget)
  const startDrill = usePostSessionStore((s) => s.startDrill)
  const stopDrill = usePostSessionStore((s) => s.stopDrill)

  const pool = postDrillPool(post)

  if (drillOn) {
    const item = target ? pool.find((p) => p.fix === target.fix) : undefined
    const streak = item?.streak ?? 0
    const title = target ? POST_FIX[target.fix].title : ''
    // Патерну вже немає в пулі, а drill стоїть на ньому — щойно закрили серією.
    const closed = target !== null && item === undefined
    const width = closed ? 100 : Math.round((streak / POST_DRILL.retire) * 100)
    return (
      <div className="drill live">
        <div className="txt">
          DRILL · {title} — <b>{pool.length} патернів у пулі</b>
          <br />
          {closed ? (
            <b>патерн закрито</b>
          ) : (
            <>
              серія <b>{streak}</b>/{POST_DRILL.retire} · помилка, навіть на контрольному
              споті, скидає серію
            </>
          )}
        </div>
        <button type="button" className="stop" onClick={stopDrill}>
          Вийти з drill
        </button>
        <div className="bar">
          <i style={{ width: `${width}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div className="drill">
      <div className="txt">
        {pool.length > 0 ? (
          <>
            Патерни помилок: <b>{pool.map((p) => POST_FIX[p.fix].title).join(' · ')}</b>
            <br />
            Половина спотів — патерн, половина — контрольні, де правильна дія інша. Патерн
            закривається після {POST_DRILL.retire} правильних поспіль.
          </>
        ) : (
          <>
            Відкритих патернів немає. Drill зʼявиться, коли у звичайній грі набереться{' '}
            {POST_DRILL.minMistakes}+ помилки одного патерну.
          </>
        )}
      </div>
      <button type="button" disabled={pool.length === 0} onClick={startDrill}>
        Запустити drill
      </button>
    </div>
  )
}
