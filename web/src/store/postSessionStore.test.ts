/**
 * Тести ганяють реальний рушій постфлопу через реальні стори (без моків), так
 * само як DrillBar.test.tsx: цінність саме в зчепленні engine → store, а не
 * в конкретному значенні випадкового спота.
 *
 * Роздача випадкова (startEpisode за замовчуванням бере Math.random), тому
 * тести читають decision.correct у момент рішення замість того, щоб покладатись
 * на конкретний seed.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { postQueue } from '../api/postSync'
import { emptyPostProgress } from '../engine/postflop'
import { emptyPreProgress } from '../engine/progress'
import { usePostSessionStore } from './postSessionStore'
import { useProgressStore } from './progressStore'

describe('usePostSessionStore', () => {
  beforeEach(() => {
    usePostSessionStore.setState({
      episode: null,
      decision: null,
      feedback: null,
      handOver: null,
      streak: 0,
      scenario: 'rfi',
    })
    useProgressStore.setState({
      pre: emptyPreProgress(),
      post: emptyPostProgress(),
      postUnlocked: false,
      postSeen: false,
      legacyImported: null,
      legacyChecked: true,
    })
  })

  it('deal роздає епізод і виставляє рішення', () => {
    usePostSessionStore.getState().deal()
    const state = usePostSessionStore.getState()

    expect(state.episode).not.toBeNull()
    expect(state.decision).not.toBeNull()
    expect(state.feedback).toBeNull()
    expect(state.handOver).toBeNull()
    expect(state.episode?.scenario).toBe('rfi')
  })

  it('правильна відповідь піднімає серію і рахується в useProgressStore', () => {
    usePostSessionStore.getState().deal()
    const decision = usePostSessionStore.getState().decision
    expect(decision).not.toBeNull()
    if (!decision) return

    usePostSessionStore.getState().answer(decision.correct)
    const state = usePostSessionStore.getState()

    expect(state.feedback?.ok).toBe(true)
    expect(state.streak).toBe(1)
    expect(useProgressStore.getState().post.total).toBe(1)
    expect(useProgressStore.getState().post.correct).toBe(1)
  })

  it('помилка обнуляє серію і лягає в журнал', () => {
    usePostSessionStore.getState().deal()
    const decision = usePostSessionStore.getState().decision
    expect(decision).not.toBeNull()
    if (!decision) return

    // Перша рука — правильна відповідь, щоб серія була ненульовою.
    usePostSessionStore.getState().answer(decision.correct)
    expect(usePostSessionStore.getState().streak).toBe(1)

    // Нова рука, свідомо неправильна відповідь.
    usePostSessionStore.getState().deal()
    const nextDecision = usePostSessionStore.getState().decision
    expect(nextDecision).not.toBeNull()
    if (!nextDecision) return
    const wrong = nextDecision.options.find((o) => o.k !== nextDecision.correct)
    expect(wrong).toBeDefined()
    if (!wrong) return

    usePostSessionStore.getState().answer(wrong.k)
    const state = usePostSessionStore.getState()

    expect(state.feedback?.ok).toBe(false)
    expect(state.streak).toBe(0)
    expect(useProgressStore.getState().post.log).toHaveLength(1)
    expect(useProgressStore.getState().post.log[0]?.ch).toBe(wrong.k)
    expect(useProgressStore.getState().post.log[0]?.co).toBe(nextDecision.correct)
  })

  it('повторна відповідь на те саме рішення ігнорується', () => {
    usePostSessionStore.getState().deal()
    const decision = usePostSessionStore.getState().decision
    expect(decision).not.toBeNull()
    if (!decision) return

    usePostSessionStore.getState().answer(decision.correct)
    const afterFirst = usePostSessionStore.getState()

    usePostSessionStore.getState().answer(decision.correct)
    const afterSecond = usePostSessionStore.getState()

    expect(afterSecond.streak).toBe(afterFirst.streak)
    expect(afterSecond.feedback).toEqual(afterFirst.feedback)
    expect(useProgressStore.getState().post.total).toBe(1)
  })

  it('continueHand веде роздачу до кінця, а потім роздає нову', () => {
    usePostSessionStore.getState().deal()
    const firstEpisodeId = usePostSessionStore.getState().episode?.id

    let guard = 0
    while (guard++ < 50) {
      const { decision, handOver } = usePostSessionStore.getState()
      if (handOver) break
      if (!decision) break
      usePostSessionStore.getState().answer(decision.correct)
      if (usePostSessionStore.getState().handOver) break
      usePostSessionStore.getState().continueHand()
    }

    expect(usePostSessionStore.getState().handOver).not.toBeNull()

    usePostSessionStore.getState().continueHand()
    const state = usePostSessionStore.getState()

    expect(state.handOver).toBeNull()
    expect(state.decision).not.toBeNull()
    expect(state.episode?.id).not.toBe(firstEpisodeId)
  })

  it("setScenario('iso') міняє сценарій епізоду", () => {
    usePostSessionStore.getState().deal()
    expect(usePostSessionStore.getState().scenario).toBe('rfi')

    usePostSessionStore.getState().setScenario('iso')
    const state = usePostSessionStore.getState()

    expect(state.scenario).toBe('iso')
    expect(state.episode?.scenario).toBe('iso')
    expect(state.decision).not.toBeNull()
  })

  it("setScenario('vsraise') роздає лінію колера і пише її в журнал", () => {
    usePostSessionStore.getState().setScenario('vsraise')
    const episode = usePostSessionStore.getState().episode
    expect(episode?.line).toBe('caller')
    expect(episode?.scenario).toBe('vsraise')

    const decision = usePostSessionStore.getState().decision
    expect(decision).not.toBeNull()
    if (!decision) return
    usePostSessionStore.getState().answer(decision.correct)

    // Журнал має знати лінію: без неї рішення колера й агресора не розрізнити.
    const row = postQueue.peek().find((r) => r.episode_id === episode?.id)
    expect(row?.line).toBe('caller')
    expect(row?.scenario).toBe('vsraise')
  })
})
