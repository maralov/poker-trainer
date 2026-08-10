/**
 * Злиття серверного прогресу з чергою — місце, де найлегше отримати подвійний
 * рахунок або, навпаки, загубити щойно зіграну руку. Тому перевіряється саме
 * арифметика і те, що локальний стан drill не затирається серверним.
 */

import { describe, expect, it } from 'vitest'

import type { QueuedAttempt } from '../api/syncQueue'
import { emptyPreProgress, recordAnswer, type PreProgress } from '../engine/progress'
import { mergeProgress } from './mergeProgress'

const queued = (over: Partial<QueuedAttempt> = {}): QueuedAttempt =>
  ({
    client_id: crypto.randomUUID(),
    stage: 'pre',
    scenario: 'rfi',
    hero_pos: 'BTN',
    hand: '72o',
    chosen: 'fold',
    correct: 'fold',
    is_drill: false,
    is_control: false,
    answered_at: '2026-08-01T10:00:00.000Z',
    ...over,
  }) as QueuedAttempt

/** Прогрес, який умовно приїхав із сервера. */
function serverProgress(total: number, correct: number): PreProgress {
  const p = emptyPreProgress()
  p.total = total
  p.correct = correct
  p.best = 7
  p.byScen['rfi'] = { t: total, c: correct }
  p.byPos['BTN'] = { t: total, c: correct }
  p.byScenPos['rfi'] = { BTN: { t: total, c: correct } }
  return p
}

describe('mergeProgress', () => {
  it('порожня черга не змінює серверних цифр', () => {
    const server = serverProgress(100, 80)
    const merged = mergeProgress(server, emptyPreProgress().drill, [])
    expect(merged.total).toBe(100)
    expect(merged.correct).toBe(80)
    expect(merged.byScen['rfi']).toEqual({ t: 100, c: 80 })
  })

  it('події з черги додаються до серверних, а не замінюють їх', () => {
    const server = serverProgress(100, 80)
    const merged = mergeProgress(server, emptyPreProgress().drill, [
      queued(),
      queued({ chosen: 'raise' }),
    ])
    expect(merged.total).toBe(102)
    expect(merged.correct).toBe(81)
    expect(merged.byScen['rfi']).toEqual({ t: 102, c: 81 })
    expect(merged.byScenPos['rfi']?.['BTN']).toEqual({ t: 102, c: 81 })
  })

  it('не мутує переданий серверний прогрес', () => {
    const server = serverProgress(100, 80)
    mergeProgress(server, emptyPreProgress().drill, [queued(), queued()])
    expect(server.total, 'сервер має лишитись недоторканим').toBe(100)
    expect(server.byScen['rfi']).toEqual({ t: 100, c: 80 })
  })

  it('повторний виклик з тією ж чергою дає той самий результат', () => {
    const server = serverProgress(100, 80)
    const q = [queued(), queued({ chosen: 'raise' })]
    const a = mergeProgress(server, emptyPreProgress().drill, q)
    const b = mergeProgress(server, emptyPreProgress().drill, q)
    expect(a.total).toBe(b.total)
    expect(a.correct).toBe(b.correct)
  })

  it('помилки з черги потрапляють у журнал — drill їх побачить одразу', () => {
    const server = serverProgress(10, 10)
    const merged = mergeProgress(server, emptyPreProgress().drill, [
      queued({ hand: 'K5s', chosen: 'raise', correct: 'fold' }),
    ])
    expect(merged.log).toHaveLength(1)
    expect(merged.log[0]).toMatchObject({ s: 'rfi', p: 'BTN', h: 'K5s', co: 'fold' })
  })

  it('локальний стан drill не затирається серверним', () => {
    const server = serverProgress(50, 40)
    const localDrill = emptyPreProgress().drill
    localDrill.streaks['rfi|BTN|72o'] = 4
    localDrill.recent['rfi'] = [1, 1, 0]

    const merged = mergeProgress(server, localDrill, [])
    expect(merged.drill.streaks['rfi|BTN|72o']).toBe(4)
    expect(merged.drill.recent['rfi']).toEqual([1, 1, 0])
  })

  it('рекорд серії не падає нижче серверного', () => {
    const server = serverProgress(100, 80)
    const merged = mergeProgress(server, emptyPreProgress().drill, [queued()])
    expect(merged.best).toBeGreaterThanOrEqual(7)
  })

  it('постфлопні події ігноруються — тут рахується лише префлоп', () => {
    const server = serverProgress(10, 10)
    const merged = mergeProgress(server, emptyPreProgress().drill, [
      queued({ stage: 'post' }),
      queued(),
    ])
    expect(merged.total).toBe(11)
  })

  describe('мітка скидання', () => {
    const at = (iso: string) => queued({ answered_at: iso })
    const RESET = Date.parse('2026-08-01T12:00:00.000Z')

    it('події до мітки не рахуються — інакше скидання «не спрацювало б»', () => {
      const merged = mergeProgress(
        emptyPreProgress(),
        emptyPreProgress().drill,
        [at('2026-08-01T11:59:00.000Z'), at('2026-08-01T11:00:00.000Z')],
        RESET,
      )
      expect(merged.total).toBe(0)
    })

    it('події після мітки рахуються', () => {
      const merged = mergeProgress(
        emptyPreProgress(),
        emptyPreProgress().drill,
        [at('2026-08-01T11:59:00.000Z'), at('2026-08-01T12:01:00.000Z')],
        RESET,
      )
      expect(merged.total).toBe(1)
    })

    it('подія рівно в момент мітки не рахується', () => {
      const merged = mergeProgress(
        emptyPreProgress(),
        emptyPreProgress().drill,
        [at('2026-08-01T12:00:00.000Z')],
        RESET,
      )
      expect(merged.total).toBe(0)
    })

    it('без мітки рахується все', () => {
      const merged = mergeProgress(emptyPreProgress(), emptyPreProgress().drill, [
        at('2020-01-01T00:00:00.000Z'),
        at('2026-08-01T12:01:00.000Z'),
      ])
      expect(merged.total).toBe(2)
    })
  })

  it('зведений прогрес поводиться як звичайний: далі його можна доповнювати', () => {
    const merged = mergeProgress(serverProgress(10, 8), emptyPreProgress().drill, [queued()])
    recordAnswer(merged, 0, {
      scen: 'rfi',
      heroPos: 'BTN',
      hand: 'AA',
      chosen: 'raise',
      correct: 'raise',
      drill: false,
      isControl: false,
      at: 1,
    })
    expect(merged.total).toBe(12)
    expect(merged.correct).toBe(10)
  })
})
