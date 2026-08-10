import { useEffect } from 'react'

import { Chips } from '../components/Chips'
import { DrillBar } from '../components/DrillBar'
import { HandCards } from '../components/HandCards'
import { PokerTable } from '../components/PokerTable'
import { StatStrip } from '../components/StatStrip'
import { Verdict } from '../components/Verdict'
import { SCENARIOS } from '../engine/ranges'
import { SCENARIO_KEYS, type Scenario } from '../engine/types'
import { useProgressStore } from '../store/progressStore'
import { useSessionStore } from '../store/sessionStore'

const SCENARIO_ITEMS = SCENARIO_KEYS.map((k) => ({ key: k, label: SCENARIOS[k].label }))

export function Train() {
  const pre = useProgressStore((s) => s.pre)
  const postSeen = useProgressStore((s) => s.postSeen)
  const postUnlocked = useProgressStore((s) => s.postUnlocked)
  const markPostSeen = useProgressStore((s) => s.markPostSeen)

  const spot = useSessionStore((s) => s.spot)
  const feedback = useSessionStore((s) => s.feedback)
  const streak = useSessionStore((s) => s.streak)
  const activeScenarios = useSessionStore((s) => s.activeScenarios)
  const drillScen = useSessionStore((s) => s.drillScen)
  const next = useSessionStore((s) => s.next)
  const answer = useSessionStore((s) => s.answer)
  const toggleScenario = useSessionStore((s) => s.toggleScenario)

  // Перший спот роздаємо після монтування, а не в ініціалізаторі стору:
  // до цього моменту persist ще не встиг відновити прогрес із localStorage.
  useEffect(() => {
    if (!spot) next()
  }, [spot, next])

  const showBanner = postUnlocked && !postSeen
  useEffect(() => {
    if (showBanner) markPostSeen()
  }, [showBanner, markPostSeen])

  const acc = pre.total ? Math.round((pre.correct / pre.total) * 100) : 0

  return (
    <section>
      {showBanner && (
        <div className="banner">
          <b>Етап 2 відкрито</b>
          <span>
            Префлоп закритий за всіма чотирма умовами. Постфлоп зʼявиться в перемикачі етапів вгорі.
          </span>
        </div>
      )}

      <Chips
        items={SCENARIO_ITEMS}
        isOn={(k) => activeScenarios.includes(k as Scenario)}
        onPick={(k) => toggleScenario(k as Scenario)}
        disabled={drillScen !== null}
      />

      <DrillBar />

      <div className="stage">
        {spot && (
          <>
            <PokerTable spot={spot} />
            <HandCards cards={spot.cards} />
            <div className="hand-label">{spot.hand}</div>
            <p className="prompt">{spot.prompt}</p>

            {!feedback && (
              <div className="acts">
                {spot.options.map((o, i) => (
                  <button
                    type="button"
                    key={o.k}
                    className={`act-btn ${o.c}`}
                    onClick={() => answer(o.k)}
                  >
                    {o.l}
                    <small>клавіша {i + 1}</small>
                  </button>
                ))}
              </div>
            )}

            {feedback && (
              <Verdict
                spot={spot}
                ok={feedback.ok}
                handStreak={feedback.handStreak}
                onNext={next}
              />
            )}
          </>
        )}
      </div>

      <StatStrip
        style={{ marginTop: 18 }}
        cells={[
          { value: streak, label: 'серія' },
          { value: `${acc}%`, label: 'точність' },
          { value: pre.total, label: 'рук' },
          { value: pre.best, label: 'рекорд' },
        ]}
      />
    </section>
  )
}
