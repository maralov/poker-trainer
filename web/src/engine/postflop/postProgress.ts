/**
 * Локальні агрегати постфлопу.
 *
 * База — джерело істини (кожне рішення їде рядком у postflop_attempts), але
 * тренування не має залежати від мережі й логіну. Ці лічильники — офлайн-буфер
 * тієї самої форми, яку потім віддає сервер: Stats і Review працюють одним
 * кодом для обох джерел.
 */

import type { Tally } from '../progress'
import type { PostFixKey } from './postReview'
import type { Facing, PostAction, PostCategory, Street, Texture } from './types'

export const POST_LOG_LIMIT = 500
/** Хвіст drill-відповідей: з нього рахуються серії й закриття патернів. */
export const POST_DRILL_LOG_LIMIT = 500

/** Від скількох рішень зріз уже щось означає — нижче підсвітка не фарбується. */
export const POST_SLICE_MIN = 10

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
  /**
   * Знімок споту: роздача (`episode_id`), борд і канонічна рука. Опційні
   * свідомо — журнали, які вже лежать у localStorage, цих полів не мають, і
   * ламати їх заради нового екрана не варто.
   */
  readonly ep?: string
  readonly board?: string
  readonly hand?: string
  /**
   * Помилка зроблена в drill. Розбір бачить її, а пул drill — ні: інакше drill
   * сам себе годував би і патерн не закривався б.
   */
  readonly d?: 1
}

/** Одна drill-відповідь: який патерн тренувався і чи влучив герой. */
export interface PostDrillEntry {
  readonly f: PostFixKey
  readonly ok: 0 | 1
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
  /** Лише drill. Зрізи й total вище рахують тільки звичайні роздачі. */
  drillLog: PostDrillEntry[]
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
  drillLog: [],
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
  /**
   * Знімок споту для розбору: роздача, борд і рука на момент рішення.
   * Опційні — виклики, яким розбір не потрібен (тести редюсера), їх не несуть.
   */
  readonly episodeId?: string
  readonly board?: string
  readonly hand?: string
  /**
   * Патерн, який тренує drill; без нього — звичайна роздача. Drill-відповідь
   * не рухає зрізи, total і рекорд: drill крутить один патерн підряд, і зрізи
   * показували б drill, а не гру.
   */
  readonly drill?: PostFixKey
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
  const at = input.at ?? Date.now()
  const drill = input.drill

  if (drill !== undefined) {
    progress.drillLog.push({ f: drill, ok: ok ? 1 : 0, t: at })
    if (progress.drillLog.length > POST_DRILL_LOG_LIMIT) {
      progress.drillLog.splice(0, progress.drillLog.length - POST_DRILL_LOG_LIMIT)
    }
  } else {
    progress.total++
    if (ok) progress.correct++

    bump(progress.byStreet, input.street, ok)
    bump(progress.byCat, input.cat, ok)
    bump(progress.byTex, input.texture, ok)
    bump(progress.byMode, postModeKey(input.nOpps, input.ip), ok)
    bump(progress.byFacing, input.facing, ok)
  }

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
      t: at,
      // Порожні поля не пишемо: журнал лежить у localStorage, і `undefined`
      // у JSON усе одно зникне — краще не робити вигляд, що дані є.
      ...(input.episodeId === undefined ? {} : { ep: input.episodeId }),
      ...(input.board === undefined ? {} : { board: input.board }),
      ...(input.hand === undefined ? {} : { hand: input.hand }),
      ...(drill === undefined ? {} : { d: 1 as const }),
    })
    if (progress.log.length > POST_LOG_LIMIT) {
      progress.log.splice(0, progress.log.length - POST_LOG_LIMIT)
    }
  }

  // Серія й рекорд — лише звичайна гра (сервер рахує best так само): drill
  // серію не рухає, інакше після виходу з drill рекорд стрибнув би на його довжину.
  if (drill !== undefined) return { progress, ok, streak: streakBefore }
  const streak = ok ? streakBefore + 1 : 0
  progress.best = Math.max(progress.best, streak)

  return { progress, ok, streak }
}
