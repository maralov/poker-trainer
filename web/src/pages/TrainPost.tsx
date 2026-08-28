import { useEffect } from 'react'

import { Chips } from '../components/Chips'
import type { PostScenario } from '../engine/postflop'
import { PostBoard } from '../components/PostBoard'
import { PostVerdict } from '../components/PostVerdict'
import { StatStrip } from '../components/StatStrip'
import { useScrollToResult } from '../hooks/useScrollToResult'
import { usePostSessionStore } from '../store/postSessionStore'
import { usePostStatsSource } from '../store/postStatsSource'

const SCENARIO_ITEMS: readonly { key: PostScenario; label: string }[] = [
  { key: 'rfi', label: 'Відкриття' },
  { key: 'iso', label: 'Ізоляція' },
  // Лінія колера: герой заколлював опен і грає постфлоп без ініціативи.
  { key: 'vsraise', label: 'Проти рейзу' },
]

export function TrainPost() {
  const post = usePostStatsSource().progress

  const episode = usePostSessionStore((s) => s.episode)
  const decision = usePostSessionStore((s) => s.decision)
  const feedback = usePostSessionStore((s) => s.feedback)
  const handOver = usePostSessionStore((s) => s.handOver)
  const streak = usePostSessionStore((s) => s.streak)
  const scenario = usePostSessionStore((s) => s.scenario)
  const deal = usePostSessionStore((s) => s.deal)
  const answer = usePostSessionStore((s) => s.answer)
  const continueHand = usePostSessionStore((s) => s.continueHand)
  const setScenario = usePostSessionStore((s) => s.setScenario)

  // Перша роздача — після монтування, а не в ініціалізаторі стору: до цього
  // моменту persist ще не встиг відновити прогрес із localStorage (те саме
  // пояснення, що й у Train.tsx).
  useEffect(() => {
    if (!episode) deal()
  }, [episode, deal])

  const sideRef = useScrollToResult(feedback !== null)

  const acc = post.total ? Math.round((post.correct / post.total) * 100) : 0

  return (
    <section>
      <Chips
        items={SCENARIO_ITEMS}
        isOn={(k) => scenario === k}
        onPick={(k) => setScenario(k)}
      />

      <div className="stage duel">
        {episode && (
          <>
            <div className="duel-board">
              <PostBoard episode={episode} frozen={feedback ? decision : null} />
            </div>

            <div className="duel-side" ref={sideRef}>
              {decision && !feedback && (
                <div className="acts">
                  {decision.options.map((o, i) => (
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

              {feedback && decision && (
                <PostVerdict
                  decision={decision}
                  ok={feedback.ok}
                  handOver={handOver}
                  onNext={continueHand}
                />
              )}
            </div>
          </>
        )}
      </div>

      <StatStrip
        cells={[
          { value: streak, label: 'серія' },
          { value: `${acc}%`, label: 'точність' },
          { value: post.total, label: 'рішень' },
          { value: post.best, label: 'рекорд' },
        ]}
      />
    </section>
  )
}
