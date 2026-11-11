/**
 * Тести на persist-стор прогресу навмисно ганяють сам стор (без моків): нас
 * цікавить саме те, що answerPost/resetPost/reset торкаються правильних
 * розділів стану і нічого зайвого.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyPostProgress, type PostAnswerInput } from '../engine/postflop'
import { emptyPreProgress, type AnswerInput } from '../engine/progress'
import { setTableProgress, tableProgress } from '../test/progress'
import { emptyTableProgress, useProgressStore } from './progressStore'

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
      tables: { '9max': emptyTableProgress(), '6max': emptyTableProgress() },
      legacyImported: null,
      legacyChecked: true,
    })
  })

  it('answerPost пише в post і не чіпає pre', () => {
    const preBefore = tableProgress().pre

    const result = useProgressStore.getState().answerPost('9max', basePost, 0)

    expect(result.ok).toBe(true)
    expect(result.streak).toBe(1)
    expect(tableProgress().post.total).toBe(1)
    expect(tableProgress().post.correct).toBe(1)
    // Той самий обʼєкт — answerPost жодного разу не торкнувся pre.
    expect(tableProgress().pre).toBe(preBefore)
  })

  it('помилка обнуляє серію і потрапляє в журнал', () => {
    useProgressStore.getState().answerPost('9max', basePost, 0)
    const result = useProgressStore
      .getState()
      .answerPost('9max', { ...basePost, chosen: 'check' }, 1)

    expect(result.ok).toBe(false)
    expect(result.streak).toBe(0)

    const { post } = tableProgress()
    expect(post.total).toBe(2)
    expect(post.correct).toBe(1)
    expect(post.log).toHaveLength(1)
    expect(post.log[0]?.ch).toBe('check')
    expect(post.log[0]?.co).toBe('b66')
  })

  it('resetPost чистить постфлоп, лишаючи префлоп і відкриті ворота', () => {
    setTableProgress({ postUnlocked: true })
    useProgressStore.getState().answer('9max', basePre, 0)
    useProgressStore.getState().answerPost('9max', basePost, 0)

    useProgressStore.getState().resetPost('9max')

    const state = tableProgress()
    expect(state.post).toEqual(emptyPostProgress())
    expect(state.pre.total).toBe(1)
    expect(state.postUnlocked).toBe(true)
  })

  it('повний reset чистить обидва розділи', () => {
    useProgressStore.getState().answer('9max', basePre, 0)
    useProgressStore.getState().answerPost('9max', basePost, 0)

    useProgressStore.getState().reset('9max')

    const state = tableProgress()
    expect(state.pre).toEqual(emptyPreProgress())
    expect(state.post).toEqual(emptyPostProgress())
  })

  it('формати не змішуються: відповідь у 6-max не чіпає 9-max', () => {
    useProgressStore.getState().answer('9max', basePre, 0)
    const nineBefore = tableProgress('9max')

    useProgressStore.getState().answer('6max', basePre, 0)
    useProgressStore.getState().answerPost('6max', basePost, 0)

    expect(tableProgress('9max')).toBe(nineBefore)
    expect(tableProgress('6max').pre.total).toBe(1)
    expect(tableProgress('6max').post.total).toBe(1)
  })

  it('reset одного формату не чіпає інший', () => {
    useProgressStore.getState().answer('9max', basePre, 0)
    useProgressStore.getState().answer('6max', basePre, 0)

    useProgressStore.getState().reset('6max')

    expect(tableProgress('6max').pre.total).toBe(0)
    expect(tableProgress('9max').pre.total).toBe(1)
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

    const state = mod.useProgressStore.getState().tables['9max']
    expect(state.pre.total).toBe(5)
    expect(state.pre.correct).toBe(3)
    expect(state.postUnlocked).toBe(true)
    expect(state.post).toEqual(emptyPostProgress())
  })

  it('версія 2 без drillLog дописує порожній, постфлоп-прогрес лишається', async () => {
    const { drillLog: _omit, ...v2Post } = { ...emptyPostProgress(), total: 7, correct: 6 }
    localStorage.setItem(
      'poker_trainer_web_v1',
      JSON.stringify({
        state: { post: v2Post, postUnlocked: true, postSeen: true, legacyImported: null, legacyChecked: true },
        version: 2,
      }),
    )

    const mod = await import('./progressStore')
    await new Promise<void>((resolve) => {
      if (mod.useProgressStore.persist.hasHydrated()) {
        resolve()
        return
      }
      mod.useProgressStore.persist.onFinishHydration(() => resolve())
    })

    const post = mod.useProgressStore.getState().tables['9max'].post
    expect(post.total).toBe(7)
    expect(post.drillLog).toEqual([])
  })

  it('версія 3 стає прогресом 9-max, 6-max — порожній', async () => {
    const pre = { ...emptyPreProgress(), total: 12, correct: 9 }
    localStorage.setItem(
      'poker_trainer_web_v1',
      JSON.stringify({
        state: {
          pre,
          post: { ...emptyPostProgress(), total: 3 },
          postUnlocked: true,
          postSeen: true,
          legacyImported: null,
          legacyChecked: true,
        },
        version: 3,
      }),
    )

    const mod = await import('./progressStore')
    await new Promise<void>((resolve) => {
      if (mod.useProgressStore.persist.hasHydrated()) {
        resolve()
        return
      }
      mod.useProgressStore.persist.onFinishHydration(() => resolve())
    })

    const { tables, legacyChecked } = mod.useProgressStore.getState()
    expect(tables['9max'].pre.total).toBe(12)
    expect(tables['9max'].post.total).toBe(3)
    expect(tables['9max'].postUnlocked).toBe(true)
    expect(tables['6max']).toEqual(emptyTableProgress())
    expect(legacyChecked).toBe(true)
    expect('pre' in mod.useProgressStore.getState()).toBe(false)
  })
})
