/**
 * Локальні агрегати постфлопу.
 *
 * База — джерело істини (кожне рішення їде рядком у postflop_attempts), але
 * тренування не має залежати від мережі й логіну. Ці лічильники — офлайн-буфер
 * тієї самої форми, яку потім віддає сервер: Stats і Review працюють одним
 * кодом для обох джерел.
 */

import type { Tally } from '../progress'
import type { Facing, PostAction, PostCategory, Street, Texture } from './types'

export const POST_LOG_LIMIT = 500

export interface PostMistakeEntry {
  readonly street: Street
  readonly cat: PostCategory
  readonly tex: Texture
  readonly facing: Facing
  /** Скільки опонентів було в роздачі на момент рішення. */
  readonly n: number
  readonly ip: 0 | 1
  readonly ch: PostAction
  readonly co: PostAction
  readonly t: number
}

export interface PostProgress {
  total: number
  correct: number
  best: number
  byStreet: Record<string, Tally>
  byCat: Record<string, Tally>
  byTex: Record<string, Tally>
  byMode: Record<string, Tally>
  byFacing: Record<string, Tally>
  log: PostMistakeEntry[]
}

export const emptyPostProgress = (): PostProgress => ({
  total: 0,
  correct: 0,
  best: 0,
  byStreet: {},
  byCat: {},
  byTex: {},
  byMode: {},
  byFacing: {},
  log: [],
})

/** Формат ключа успадкований від референсу: роздільник — U+00B7. */
export const postModeKey = (nOpps: number, ip: boolean): string =>
  `${nOpps >= 2 ? 'MULTI' : 'HU'}·${ip ? 'IP' : 'OOP'}`

const bump = (table: Record<string, Tally>, key: string, ok: boolean): void => {
  const d = table[key] ?? { t: 0, c: 0 }
  d.t++
  if (ok) d.c++
  table[key] = d
}

export interface PostAnswerInput {
  readonly street: Street
  readonly cat: PostCategory
  readonly texture: Texture
  readonly facing: Facing
  readonly nOpps: number
  readonly ip: boolean
  readonly chosen: PostAction
  readonly correct: PostAction
  /** Час відповіді (ms). Інжектується, щоб тести були детермінованими. */
  readonly at?: number
}

export interface PostAnswerRecord {
  readonly progress: PostProgress
  readonly ok: boolean
  readonly streak: number
}

/** Мутує переданий обʼєкт — так само, як recordAnswer префлопу: стор клонує стан. */
export function recordPostAnswer(
  progress: PostProgress,
  streakBefore: number,
  input: PostAnswerInput,
): PostAnswerRecord {
  const ok = input.chosen === input.correct

  progress.total++
  if (ok) progress.correct++

  bump(progress.byStreet, input.street, ok)
  bump(progress.byCat, input.cat, ok)
  bump(progress.byTex, input.texture, ok)
  bump(progress.byMode, postModeKey(input.nOpps, input.ip), ok)
  bump(progress.byFacing, input.facing, ok)

  if (!ok) {
    progress.log.push({
      street: input.street,
      cat: input.cat,
      tex: input.texture,
      facing: input.facing,
      n: input.nOpps,
      ip: input.ip ? 1 : 0,
      ch: input.chosen,
      co: input.correct,
      t: input.at ?? Date.now(),
    })
    if (progress.log.length > POST_LOG_LIMIT) {
      progress.log.splice(0, progress.log.length - POST_LOG_LIMIT)
    }
  }

  const streak = ok ? streakBefore + 1 : 0
  progress.best = Math.max(progress.best, streak)

  return { progress, ok, streak }
}
