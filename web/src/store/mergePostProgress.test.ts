/**
 * Серверні цифри відстають рівно на те, що ще в черзі. Злиття дописує
 * невідправлені рішення, щоб інтерфейс не показував менше, ніж зіграно.
 */

import { describe, expect, it } from 'vitest'

import type { QueuedPostAttempt } from '../api/postSync'
import { emptyPostProgress } from '../engine/postflop'
import { mergePostProgress } from './mergePostProgress'

const queued = (over: Partial<QueuedPostAttempt> = {}): QueuedPostAttempt =>
  ({
    client_id: crypto.randomUUID(),
    episode_id: crypto.randomUUID(),
    line: 'aggressor',
    scenario: 'rfi',
    hero_pos: 'CO',
    opp_pos: 'BB',
    n_opps: 1,
    ip: true,
    street: 'flop',
    board: 'Ks7d2c',
    hand: 'AKs',
    hole: 'AsKs',
    category: 'AIR',
    texture: 'DRY',
    facing: 'none',
    repeat_aggro: false,
    pot_bb: 7.5,
    chosen: 'check',
    correct: 'check',
    answered_at: '2026-08-01T10:00:00.000Z',
    ...over,
  }) as QueuedPostAttempt

describe('mergePostProgress', () => {
  it('порожня черга нічого не змінює', () => {
    const server = { ...emptyPostProgress(), total: 5, correct: 4 }
    const merged = mergePostProgress(server, [])
    expect(merged.total).toBe(5)
    expect(merged.correct).toBe(4)
  })

  it('події з черги додаються до серверних цифр', () => {
    const server = { ...emptyPostProgress(), total: 5, correct: 4 }
    const merged = mergePostProgress(server, [queued(), queued({ chosen: 'b66' })])

    expect(merged.total).toBe(7)
    expect(merged.correct).toBe(5)
    expect(merged.byStreet['flop']).toEqual({ t: 2, c: 1 })
    expect(merged.log, 'у журнал іде лише помилка').toHaveLength(1)
  })

  it('розкладає чергу по тих самих зрізах, що й сервер', () => {
    const merged = mergePostProgress(emptyPostProgress(), [
      queued({ street: 'turn', category: 'MEDIUM', texture: 'WET', n_opps: 2, ip: false }),
      queued({ facing: 'big_bet', chosen: 'fold', correct: 'call' }),
    ])

    expect(merged.byStreet['turn']).toEqual({ t: 1, c: 1 })
    expect(merged.byCat['MEDIUM']).toEqual({ t: 1, c: 1 })
    expect(merged.byTex['WET']).toEqual({ t: 1, c: 1 })
    expect(merged.byMode['MULTI·OOP']).toEqual({ t: 1, c: 1 })
    expect(merged.byFacing['big_bet']).toEqual({ t: 1, c: 0 })
  })

  it('серверний обʼєкт не мутується', () => {
    const server = { ...emptyPostProgress(), total: 5, correct: 4 }
    mergePostProgress(server, [queued()])
    expect(server.total, 'вхідний прогрес має лишитись цілим').toBe(5)
    expect(server.byStreet).toEqual({})
  })
})
