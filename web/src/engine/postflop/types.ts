/**
 * Типи Етапу 2. Виділені окремо, щоб решта підмодуля не тягнула одна одну
 * заради одного псевдоніма.
 *
 * Джерело істини: docs/superpowers/specs/2026-08-11-postflop-stage-design.md
 */

export const STREETS = ['flop', 'turn', 'river'] as const
export type Street = (typeof STREETS)[number]

/** Роль героя в роздачі. */
export type PostLine = 'aggressor' | 'caller'

/** Префлоп-сценарій, з якого виріс епізод. Той самий набір, що в схемі бази. */
export type PostScenario = 'rfi' | 'iso' | 'vsraise'

/**
 * Категорія руки. STRONG референсу розщеплений надвоє: у контекстах «проти
 * ставки» одна пара і дві пари грають по-різному — з однією парою в стек не
 * їдемо. Там, де дія «можу ставити», обидва підтипи поводяться однаково.
 */
export type PostCategory =
  | 'STRONG_MADE'
  | 'STRONG_PAIR'
  | 'MEDIUM'
  | 'WEAK'
  | 'DRAW'
  | 'WEAKDRAW'
  | 'AIR'

export const POST_CATEGORIES = [
  'STRONG_MADE',
  'STRONG_PAIR',
  'MEDIUM',
  'WEAK',
  'DRAW',
  'WEAKDRAW',
  'AIR',
] as const

export type Texture = 'DRY' | 'WET' | 'PAIRED'

/** Дія на постфлопі. Префлопний Action ('raise'|'call'|'fold') тут не годиться. */
export type PostAction = 'check' | 'b33' | 'b66' | 'fold' | 'call' | 'raise'

/** Що стоїть перед героєм у момент рішення. Ціна: мала ≤40% банку, велика — далі. */
export type Facing = 'none' | 'small_bet' | 'big_bet' | 'raise'

export const isStrong = (c: PostCategory): boolean =>
  c === 'STRONG_MADE' || c === 'STRONG_PAIR'

export const isBet = (a: PostAction): boolean => a === 'b33' || a === 'b66'

/** Події борду поверх флоп-текстури — вхід матриць терну й рівера. */
export interface BoardEvents {
  /** На борді зібралось 3+ карти однієї масті. */
  readonly flushClosed: boolean
  readonly boardPaired: boolean
  /** Остання карта старша за весь флоп. */
  readonly overcard: boolean
}

export interface HandEval {
  readonly cat: PostCategory
  /** Людський опис руки для вердикту: «топ-пара, сильний кікер + гатшот». */
  readonly label: string
  /** Рука вже зібрала флеш — потрібно матриці терну для вибору сайзу. */
  readonly madeFlush: boolean
}

export const POST_CAT_LABEL: Readonly<Record<PostCategory, string>> = {
  STRONG_MADE: 'Сильна рука',
  STRONG_PAIR: 'Сильна пара',
  MEDIUM: 'Середня рука',
  WEAK: 'Слабка пара',
  DRAW: 'Сильне дро',
  WEAKDRAW: 'Слабке дро / оверкарти',
  AIR: 'Порожньо',
}

export const TEX_LABEL: Readonly<Record<Texture, string>> = {
  DRY: 'суха',
  WET: 'мокра',
  PAIRED: 'спарена',
}

export const POST_ACT_LABEL: Readonly<Record<PostAction, string>> = {
  check: 'чек',
  b33: 'ставка 33%',
  b66: 'ставка 66%',
  fold: 'фолд',
  call: 'колл',
  raise: 'рейз',
}

export const STREET_LABEL: Readonly<Record<Street, string>> = {
  flop: 'флоп',
  turn: 'терн',
  river: 'рівер',
}
