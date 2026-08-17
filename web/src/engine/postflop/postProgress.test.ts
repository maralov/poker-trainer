import { describe, expect, it } from 'vitest'

import {
  POST_LOG_LIMIT,
  emptyPostProgress,
  postModeKey,
  recordPostAnswer,
  type PostAnswerInput,
  type PostProgress,
} from './postProgress'

const answer = (over: Partial<PostAnswerInput> = {}): PostAnswerInput => ({
  street: 'flop',
  cat: 'AIR',
  texture: 'DRY',
  facing: 'none',
  nOpps: 1,
  ip: true,
  chosen: 'check',
  correct: 'check',
  at: 1_700_000_000_000,
  ...over,
})

/** Прогонить n відповідей і повертає фінальну серію. */
function run(p: PostProgress, inputs: PostAnswerInput[]): number {
  let streak = 0
  for (const input of inputs) streak = recordPostAnswer(p, streak, input).streak
  return streak
}

describe('recordPostAnswer', () => {
  it('порожній прогрес — усі лічильники нульові', () => {
    const p = emptyPostProgress()
    expect(p.total).toBe(0)
    expect(p.log).toEqual([])
    expect(p.byStreet).toEqual({})
  })

  it('рахує загальні цифри і серію', () => {
    const p = emptyPostProgress()
    const streak = run(p, [answer(), answer(), answer({ chosen: 'b33' }), answer()])
    expect(p.total).toBe(4)
    expect(p.correct).toBe(3)
    expect(p.best).toBe(2)
    expect(streak).toBe(1)
  })

  it('розкладає по вулиці, категорії, текстурі, режиму і контексту', () => {
    const p = emptyPostProgress()
    run(p, [
      answer({ street: 'turn', cat: 'MEDIUM', texture: 'WET', nOpps: 2, ip: false }),
      answer({ street: 'turn', cat: 'MEDIUM', texture: 'WET', nOpps: 2, ip: false, chosen: 'b66' }),
      answer({ facing: 'big_bet', chosen: 'fold', correct: 'fold' }),
    ])
    expect(p.byStreet['turn']).toEqual({ t: 2, c: 1 })
    expect(p.byStreet['flop']).toEqual({ t: 1, c: 1 })
    expect(p.byCat['MEDIUM']).toEqual({ t: 2, c: 1 })
    expect(p.byTex['WET']).toEqual({ t: 2, c: 1 })
    expect(p.byMode['MULTI·OOP']).toEqual({ t: 2, c: 1 })
    expect(p.byFacing['big_bet']).toEqual({ t: 1, c: 1 })
  })

  it('журнал поповнюється лише помилками', () => {
    const p = emptyPostProgress()
    run(p, [answer(), answer({ chosen: 'b66' }), answer()])
    expect(p.log).toHaveLength(1)
    expect(p.log[0]).toEqual({
      street: 'flop',
      cat: 'AIR',
      tex: 'DRY',
      facing: 'none',
      n: 1,
      ip: 1,
      ch: 'b66',
      co: 'check',
      t: 1_700_000_000_000,
    })
  })

  it('журнал обрізається до межі, лишаючи найсвіжіші записи', () => {
    const p = emptyPostProgress()
    const inputs = Array.from({ length: POST_LOG_LIMIT + 40 }, (_, i) =>
      answer({ chosen: 'b66', at: i }),
    )
    run(p, inputs)
    expect(p.log).toHaveLength(POST_LOG_LIMIT)
    expect(p.log.at(-1)?.t).toBe(POST_LOG_LIMIT + 39)
  })

  it('ключ режиму збігається з форматом референсу', () => {
    expect(postModeKey(1, true)).toBe('HU·IP')
    expect(postModeKey(1, false)).toBe('HU·OOP')
    expect(postModeKey(3, true)).toBe('MULTI·IP')
  })
})

describe('знімок споту в журналі', () => {
  it('роздача, борд і рука доходять до запису помилки', () => {
    const p = emptyPostProgress()
    recordPostAnswer(p, 0, {
      street: 'turn',
      cat: 'STRONG_PAIR',
      texture: 'WET',
      facing: 'big_bet',
      nOpps: 1,
      ip: false,
      chosen: 'call',
      correct: 'fold',
      at: 5,
      episodeId: 'episode-7',
      board: 'Ks7d2c9h',
      hand: 'AKs',
    })

    expect(p.log[0]?.ep).toBe('episode-7')
    expect(p.log[0]?.board).toBe('Ks7d2c9h')
    expect(p.log[0]?.hand).toBe('AKs')
  })

  it('без знімка запис лишається валідним — старі журнали не ламаються', () => {
    const p = emptyPostProgress()
    recordPostAnswer(p, 0, {
      street: 'flop',
      cat: 'AIR',
      texture: 'DRY',
      facing: 'none',
      nOpps: 1,
      ip: true,
      chosen: 'b33',
      correct: 'check',
      at: 5,
    })

    const entry = p.log[0]
    expect(entry).toBeDefined()
    expect(entry && 'ep' in entry).toBe(false)
    expect(entry && 'board' in entry).toBe(false)
  })
})
