import { describe, expect, it } from 'vitest'

import {
  DRILL_RECENT_LIMIT,
  LOG_LIMIT,
  RECENT_LIMIT,
  emptyPreProgress,
  recordAnswer,
  type AnswerInput,
  type PreProgress,
} from './progress'

const answer = (over: Partial<AnswerInput> = {}): AnswerInput => ({
  scen: 'rfi',
  heroPos: 'BTN',
  hand: '72o',
  chosen: 'fold',
  correct: 'fold',
  drill: false,
  isControl: false,
  at: 1_700_000_000_000,
  ...over,
})

/** Прогонить n відповідей і повертає фінальну серію. */
function run(p: PreProgress, inputs: AnswerInput[]): number {
  let streak = 0
  for (const input of inputs) streak = recordAnswer(p, streak, input).streak
  return streak
}

describe('recordAnswer', () => {
  it('рахує загальні лічильники й серію', () => {
    const p = emptyPreProgress()
    const streak = run(p, [answer(), answer(), answer({ chosen: 'raise' }), answer()])
    expect(p.total).toBe(4)
    expect(p.correct).toBe(3)
    expect(p.best).toBe(2)
    expect(streak).toBe(1)
  })

  it('помилка обнуляє серію, рекорд лишається', () => {
    const p = emptyPreProgress()
    run(p, [answer(), answer(), answer(), answer({ chosen: 'raise' })])
    expect(p.best).toBe(3)
  })

  it('веде зрізи byPos, byScen і byScenPos', () => {
    const p = emptyPreProgress()
    run(p, [
      answer({ scen: 'rfi', heroPos: 'BTN' }),
      answer({ scen: 'rfi', heroPos: 'BTN', chosen: 'raise' }),
      answer({ scen: 'iso', heroPos: 'BTN' }),
    ])
    expect(p.byPos['BTN']).toEqual({ t: 3, c: 2 })
    expect(p.byScen['rfi']).toEqual({ t: 2, c: 1 })
    expect(p.byScen['iso']).toEqual({ t: 1, c: 1 })
    expect(p.byScenPos['rfi']?.['BTN']).toEqual({ t: 2, c: 1 })
    expect(p.byScenPos['iso']?.['BTN']).toEqual({ t: 1, c: 1 })
  })

  it('позиції не течуть між сценаріями', () => {
    const p = emptyPreProgress()
    run(p, [
      answer({ scen: 'rfi', heroPos: 'UTG', chosen: 'raise' }),
      answer({ scen: 'iso', heroPos: 'UTG' }),
    ])
    expect(p.byScenPos['rfi']?.['UTG']).toEqual({ t: 1, c: 0 })
    expect(p.byScenPos['iso']?.['UTG']).toEqual({ t: 1, c: 1 })
    expect(p.byScenPos['vsraise']).toBeUndefined()
  })

  it('вага помилки: +2 за промах, −1 за влучання, зникає на нулі', () => {
    const p = emptyPreProgress()
    const wrong = answer({ chosen: 'raise' })
    recordAnswer(p, 0, wrong)
    expect(p.missed['rfi|BTN|72o']).toBe(2)
    recordAnswer(p, 0, answer())
    expect(p.missed['rfi|BTN|72o']).toBe(1)
    recordAnswer(p, 0, answer())
    expect(p.missed['rfi|BTN|72o']).toBeUndefined()
    // Нижче нуля не йде.
    recordAnswer(p, 0, answer())
    expect(p.missed['rfi|BTN|72o']).toBeUndefined()
  })

  it('журнал поповнюється лише помилками', () => {
    const p = emptyPreProgress()
    run(p, [answer(), answer({ chosen: 'raise' }), answer()])
    expect(p.log).toHaveLength(1)
    expect(p.log[0]).toEqual({
      s: 'rfi',
      p: 'BTN',
      h: '72o',
      ch: 'raise',
      co: 'fold',
      t: 1_700_000_000_000,
    })
  })

  it('журнал обрізається до 500 записів, лишається хвіст', () => {
    const p = emptyPreProgress()
    for (let i = 0; i < LOG_LIMIT + 40; i++) {
      recordAnswer(p, 0, answer({ chosen: 'raise', at: i }))
    }
    expect(p.log).toHaveLength(LOG_LIMIT)
    expect(p.log[0]?.t).toBe(40)
    expect(p.log.at(-1)?.t).toBe(LOG_LIMIT + 39)
  })

  it('recent обрізається до 400 записів', () => {
    const p = emptyPreProgress()
    for (let i = 0; i < RECENT_LIMIT + 25; i++) recordAnswer(p, 0, answer())
    expect(p.recent).toHaveLength(RECENT_LIMIT)
  })

  it('drill: серія по руці росте лише на «ліках», не на контролях', () => {
    const p = emptyPreProgress()
    const key = 'rfi|BTN|72o'

    recordAnswer(p, 0, answer({ drill: true }))
    expect(p.drill.streaks[key]).toBe(1)

    recordAnswer(p, 0, answer({ drill: true, isControl: true }))
    expect(p.drill.streaks[key], 'контроль не додає серію').toBe(1)

    recordAnswer(p, 0, answer({ drill: true }))
    expect(p.drill.streaks[key]).toBe(2)
  })

  it('drill: помилка обнуляє серію по руці навіть поза drill', () => {
    const p = emptyPreProgress()
    const key = 'rfi|BTN|72o'
    p.drill.streaks[key] = 4
    recordAnswer(p, 0, answer({ chosen: 'raise' }))
    expect(p.drill.streaks[key]).toBe(0)
  })

  it('drill: вікно точності пишеться лише в drill-режимі й обрізається до 200', () => {
    const p = emptyPreProgress()
    recordAnswer(p, 0, answer())
    expect(p.drill.recent['rfi']).toBeUndefined()

    for (let i = 0; i < DRILL_RECENT_LIMIT + 10; i++) {
      recordAnswer(p, 0, answer({ drill: true }))
    }
    expect(p.drill.recent['rfi']).toHaveLength(DRILL_RECENT_LIMIT)
  })

  it('handStreak у результаті збігається зі станом', () => {
    const p = emptyPreProgress()
    recordAnswer(p, 0, answer({ drill: true }))
    const r = recordAnswer(p, 1, answer({ drill: true }))
    expect(r.handStreak).toBe(2)
    expect(r.ok).toBe(true)
    expect(r.streak).toBe(2)
  })
})
