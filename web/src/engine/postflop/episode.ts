/**
 * Стан однієї роздачі. Виділений окремо від build.ts і step.ts, бо його ділять
 * обидва: build створює, step рухає.
 *
 * Стан мутабельний навмисно — так само, як PreProgress у префлопі: стор клонує
 * його перед викликом, а рушій лишається синхронним і без копій на кожен крок.
 */

import type { Card, Position } from '../types'
import type { PostLine, PostScenario, Street, Texture } from './types'

export interface EpisodeSeat {
  readonly pos: Position
  readonly hole: readonly Card[]
  readonly hero: boolean
  /** Скільки лишилось у стеку. */
  stack: number
  /** Вкладено на поточній вулиці. */
  put: number
  folded: boolean
}

export interface ShownHand {
  readonly pos: Position
  readonly hole: readonly Card[]
  readonly label: string
  readonly won: boolean
}

export interface EpisodeEnd {
  readonly kind: 'hero-folded' | 'villains-folded' | 'showdown'
  readonly heroWon: boolean
  readonly potBB: number
  /** Порожньо, якщо до шоудауну не дійшло. */
  readonly shown: readonly ShownHand[]
}

export interface EpisodeState {
  /**
   * Ідентифікатор роздачі для журналу (`episode_id` у схемі бази, спека §8).
   * engine його не генерує (правило 5 CLAUDE.md: без crypto чи інших
   * зовнішніх залежностей) — порожній рядок, доки викликач (стор) не передасть
   * свій через BuildOptions.id.
   */
  readonly id: string
  readonly line: PostLine
  readonly scenario: PostScenario
  readonly heroPos: Position
  readonly seats: EpisodeSeat[]
  /** Індекс героя в seats. */
  readonly heroIdx: number
  /** Текстура флопу фіксується один раз і далі не перераховується. */
  readonly texture: Texture
  /** Герой у позиції відносно всіх колерів (рахується на роздачі). */
  readonly ip: boolean
  readonly deck: Card[]
  board: Card[]
  street: Street
  potBB: number
  /** Ставка, яку треба зрівняти на цій вулиці. */
  bet: number
  /** На вулиці вже був рейз — більше рейзів не буває (cap, спека §3.3). */
  raised: boolean
  /**
   * Частка банку в останній ставці на вулиці: за нею відрізняється «мала» ціна
   * (≤0.4) від «великої». Рейз завжди рахується великою ціною.
   * Вживатиметься редюсером у наступній задачі.
   */
  lastBetFraction: number
  /** Хто вже діяв на цій вулиці після останньої ставки. */
  acted: Set<number>
  /** Скільки разів опоненти проявили агресію за всю роздачу. */
  villainAggro: number
  /** На попередній вулиці ставок не було. */
  delayed: boolean
  /** Чи були ставки на поточній вулиці — потрібно для delayed наступної. */
  streetHadBet: boolean
  /** Стрічка подій роздачі для UI, українською. */
  history: string[]
  finished: EpisodeEnd | null
}
