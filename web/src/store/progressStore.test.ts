/**
 * Тести на persist-стор прогресу навмисно ганяють сам стор (без моків): нас
 * цікавить саме те, що answerPost/resetPost/reset торкаються правильних
 * розділів стану і нічого зайвого.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyPostProgress, type PostAnswerInput } from '../engine/postflop'
import { emptyPreProgress, type AnswerInput } from '../engine/progress'
import { useProgressStore } from './progressStore'

const basePost: PostAnswerInput = {
  street: 'flop',
  cat: 'STRONG_MADE',
  texture: 'DRY',
  facing: 'none',
  nOpps: 1,
  ip: true,
  chosen: 'b66',
  correct: 'b66',
}

const basePre: AnswerInput = {
  scen: 'rfi',
  heroPos: 'UTG',
  hand: 'AA',
  chosen: 'raise',
  correct: 'raise',
  drill: false,
  isControl: false,
}

describe('useProgressStore', () => {
  beforeEach(() => {
    useProgressStore.setState({
      pre: emptyPreProgress(),
      post: emptyPostProgress(),
      postUnlocked: false,
      postSeen: false,
      legacyImported: null,
      legacyChecked: true,
    })
  })

  it('answerPost пише в post і не чіпає pre', () => {
    const preBefore = useProgressStore.getState().pre

    const result = useProgressStore.getState().answerPost(basePost, 0)

    expect(result.ok).toBe(true)
    expect(result.streak).toBe(1)
    expect(useProgressStore.getState().post.total).toBe(1)
    expect(useProgressStore.getState().post.correct).toBe(1)
    // Той самий обʼєкт — answerPost жодного разу не торкнувся pre.
    expect(useProgressStore.getState().pre).toBe(preBefore)
  })

  it('помилка обнуляє серію і потрапляє в журнал', () => {
    useProgressStore.getState().answerPost(basePost, 0)
    const result = useProgressStore.getState().answerPost({ ...basePost, chosen: 'check' }, 1)

    expect(result.ok).toBe(false)
    expect(result.streak).toBe(0)

    const { post } = useProgressStore.getState()
    expect(post.total).toBe(2)
    expect(post.correct).toBe(1)
    expect(post.log).toHaveLength(1)
    expect(post.log[0]?.ch).toBe('check')
    expect(post.log[0]?.co).toBe('b66')
  })

  it('resetPost чистить постфлоп, лишаючи префлоп і відкриті ворота', () => {
    useProgressStore.setState({ postUnlocked: true })
    useProgressStore.getState().answer(basePre, 0)
    useProgressStore.getState().answerPost(basePost, 0)

    useProgressStore.getState().resetPost()

    const state = useProgressStore.getState()
    expect(state.post).toEqual(emptyPostProgress())
    expect(state.pre.total).toBe(1)
    expect(state.postUnlocked).toBe(true)
  })

  it('повний reset чистить обидва розділи', () => {
    useProgressStore.getState().answer(basePre, 0)
    useProgressStore.getState().answerPost(basePost, 0)

    useProgressStore.getState().reset()

    const state = useProgressStore.getState()
    expect(state.pre).toEqual(emptyPreProgress())
    expect(state.post).toEqual(emptyPostProgress())
  })
})

describe('useProgressStore persist migrate', () => {
  beforeEach(() => {
    localStorage.clear()
    // Свіжий екземпляр модуля на кожен тест: рехідрація зі сховища відбувається
    // один раз при імпорті, тож повторний import того самого модуля її не повторить.
    vi.resetModules()
  })

  it('версія 1 без post мігрує на версію 2 з порожнім post, нічого не втрачаючи', async () => {
    const legacyState = {
      pre: {
        total: 5,
        correct: 3,
        best: 2,
        byPos: { UTG: { t: 5, c: 3 } },
        byScenPos: {},
        byScen: {},
        missed: {},
        log: [],
        recent: [],
        drill: { streaks: {}, recent: {} },
      },
      postUnlocked: true,
      postSeen: true,
      legacyImported: null,
      legacyChecked: true,
    }
    localStorage.setItem(
      'poker_trainer_web_v1',
      JSON.stringify({ state: legacyState, version: 1 }),
    )

    const mod = await import('./progressStore')
    await new Promise<void>((resolve) => {
      if (mod.useProgressStore.persist.hasHydrated()) {
        resolve()
        return
      }
      mod.useProgressStore.persist.onFinishHydration(() => resolve())
    })

    const state = mod.useProgressStore.getState()
    expect(state.pre.total).toBe(5)
    expect(state.pre.correct).toBe(3)
    expect(state.postUnlocked).toBe(true)
    expect(state.post).toEqual(emptyPostProgress())
  })
})
