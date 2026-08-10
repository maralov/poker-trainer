/**
 * Спільні типи ігрового рушія.
 *
 * Цей модуль (як і весь engine/) не імпортує React, zustand чи DOM —
 * це умова того, що логіку можна покрити тестами без рендера.
 */

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const
export type Rank = (typeof RANKS)[number]

/** Порядок дій за столом. Індекс тут — це «хто ходить раніше». */
export const ACTION_ORDER = [
  'UTG',
  'UTG+1',
  'MP',
  'LJ',
  'HJ',
  'CO',
  'BTN',
  'SB',
  'BB',
] as const
export type Position = (typeof ACTION_ORDER)[number]

/** Порядок дій на постфлопі — блайнди діють першими. */
export const POSTFLOP_ORDER = [
  'SB',
  'BB',
  'UTG',
  'UTG+1',
  'MP',
  'LJ',
  'HJ',
  'CO',
  'BTN',
] as const

export const SCENARIO_KEYS = ['rfi', 'iso', 'vsraise', 'vs3bet'] as const
export type Scenario = (typeof SCENARIO_KEYS)[number]

/** Дія героя. Назва на кнопці залежить від сценарію (див. actionName). */
export type Action = 'raise' | 'call' | 'fold'

/** Що зробив опонент на своєму сіті. `null` — ще не діяв. */
export type SeatAction = 'fold' | 'limp' | 'raise' | '3bet'

/** Рука в канонічному записі: 'AA', 'AKs', 'AKo'. */
export type Hand = string

export interface Suit {
  readonly g: string
  readonly red: 0 | 1
}

export interface Card {
  readonly rk: Rank
  /** Числове старшинство: A=14 … 2=2. Потрібне постфлопу. */
  readonly v: number
  /** Індекс масті в SUITS. */
  readonly s: number
  readonly g: string
  readonly red: 0 | 1
}

/** Джерело випадковості. Інжектується, щоб тести були детермінованими. */
export type Rng = () => number

export interface RangePair {
  readonly raise: ReadonlySet<Hand>
  readonly call: ReadonlySet<Hand>
}

export interface ActionOption {
  readonly k: Action
  /** Підпис на кнопці. */
  readonly l: string
  /** CSS-клас кнопки з референсу: primary | mid | soft | ghost. */
  readonly c: 'primary' | 'mid' | 'soft' | 'ghost'
}

/** Готовий спот для показу гравцеві. */
export interface Spot {
  readonly scen: Scenario
  readonly heroPos: Position
  readonly seats: Readonly<Record<Position, SeatAction | null>>
  readonly ranges: RangePair
  readonly options: readonly ActionOption[]
  readonly prompt: string
  readonly potBB: number
  readonly correct: Action
  readonly hand: Hand
  readonly cards: readonly Card[]
  readonly explainExtra: string
  /** Спот згенеровано в drill-режимі. */
  readonly drill: boolean
  /** Контрольна рука в drill: та сама позиція, але поза пулом помилок. */
  readonly isControl: boolean
  /**
   * Позиція опонента, який задав спот: опенер для vsraise, 3-бетор для vs3bet.
   * Для rfi та iso — null. Поле не існує в HTML-референсі; додане, щоб drill
   * міг відтворити точний контекст (див. CLAUDE.md).
   */
  readonly villainPos: Position | null
  /** Кількість лімперів для iso; для решти сценаріїв — null. */
  readonly limpers: number | null
}
