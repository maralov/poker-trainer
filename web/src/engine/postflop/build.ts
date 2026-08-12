/**
 * Роздача постфлоп-епізоду.
 *
 * Сумісність із префлопом тримається на тому, що жодних власних діапазонів тут
 * немає: рука героя береться з RFI його позиції, руки колерів — з тих самих
 * чартів захисту, які тренує сценарій vsraise. Тому спот, який герой бачить на
 * флопі, міг реально виникнути з префлопу, якого його вчили.
 */

import { combos } from '../cards'
import { BUCKET, HERO_CTX, ISO, OPEN_ORDER, RFI, S, VS_RAISE } from '../ranges'
import { ACTION_ORDER, POSTFLOP_ORDER, type Hand, type Position, type Rng } from '../types'
import { drawCards, drawHand, makeDeck } from './deck'
import type { EpisodeSeat, EpisodeState } from './episode'
import { evalHand, texture } from './evaluate'
import { isStrong } from './types'

export const BUILD = {
  /** Ефективні стеки на початку роздачі, bb. */
  startStack: 100,
  /** Розмір опену, bb. */
  openBB: 3,
  /** Цільова частка епізодів, де хоча б один опонент має на флопі силу. */
  strongShare: 0.3,
  /** Скільки разів перероздаємо заради цільової частки, перш ніж узяти як є. */
  maxTries: 50,
} as const

export interface BuildOptions {
  readonly rng?: Rng
  readonly strongShare?: number
  readonly maxTries?: number
  readonly scenario?: 'rfi' | 'iso'
}

/** Позиції, які можуть бути героєм-агресором: ті, що відкривають пот, плюс SB. */
const HERO_POSITIONS: readonly Position[] = [...OPEN_ORDER, 'SB']

/**
 * Лімп-діапазон мікрополя. Джерела в референсі немає — це нові дані, визначені
 * спекою (§3.1): типовий лузовий лімп 9-max кеша на низьких лімітах.
 */
export const LIMP_RANGE: ReadonlySet<Hand> = S(
  '22-99', 'A2s-A9s', 'KTs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', '65s',
  'KJo', 'QJo', 'JTo', 'A2o-A9o',
)

/** Чим лімпер продовжує проти ізолейту: пари, мастеві й бродвейний офсьют. */
export const LIMP_CALL: ReadonlySet<Hand> = S(
  '22-99', 'A2s-A9s', 'KTs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', '65s',
  'KJo', 'QJo', 'JTo',
)

/** Рука з діапазону, зважена за комбінаціями — так само, як у референсі. */
function pickWeighted(range: ReadonlySet<Hand>, rng: Rng): Hand | null {
  const bag: Hand[] = []
  for (const h of range) {
    const n = Math.max(1, combos(h) / 2)
    for (let i = 0; i < n; i++) bag.push(h)
  }
  if (bag.length === 0) return null
  return bag[Math.floor(rng() * bag.length)] ?? null
}

/** Одна спроба роздачі. null — не склалось (карт забракло), викликач пробує ще. */
function dealOnce(scenario: 'rfi' | 'iso', rng: Rng): EpisodeState | null {
  const heroPos = HERO_POSITIONS[Math.floor(rng() * HERO_POSITIONS.length)]
  if (heroPos === undefined) return null

  const hi = ACTION_ORDER.indexOf(heroPos)
  const bucket = BUCKET(heroPos)
  const isIso = scenario === 'iso'

  // Діапазон героя: для iso — ISO його позиції, для rfi — RFI.
  const heroRange = isIso ? (ISO[heroPos] ?? new Set<Hand>()) : (RFI[heroPos] ?? new Set<Hand>())

  // Кандидати в колери: діють після героя. Для rfi — лише ті, у кого
  // непорожній діапазон захисту; для iso лімпером може бути будь-хто.
  const pool = ACTION_ORDER.slice(hi + 1).filter((p) =>
    isIso ? true : VS_RAISE[bucket].call[HERO_CTX(p)].size > 0,
  )
  if (pool.length === 0) return null

  // Ваги кількості опонентів. rfi — з референсу: 50% один, 36% два, 14% три.
  // iso — лімперів один-два, як у префлопному сценарії iso.
  const wanted = isIso ? (rng() < 0.55 ? 1 : 2) : rng() < 0.5 ? 1 : rng() < 0.72 ? 2 : 3
  const callers: Position[] = []
  const rest = [...pool]
  for (let k = 0; k < Math.min(wanted, rest.length); k++) {
    const idx = Math.floor(rng() * rest.length)
    const [pos] = rest.splice(idx, 1)
    if (pos) callers.push(pos)
  }
  if (callers.length === 0) return null

  const deck = makeDeck()

  const heroHand = pickWeighted(heroRange, rng)
  if (heroHand === null) return null
  const heroHole = drawHand(deck, heroHand, rng)
  if (heroHole === null) return null

  // Розмір рейзу героя: openBB для rfi, 4bb + 1 за кожного лімпера для iso.
  const raiseBB = isIso ? 4 + callers.length : BUILD.openBB

  const seats: EpisodeSeat[] = []
  const stack = BUILD.startStack - raiseBB

  // Порядок сітів — постфлопний: так само читається і рушієм, і UI.
  const inHand: Position[] = [heroPos, ...callers]
  const ordered = POSTFLOP_ORDER.filter((p) => inHand.includes(p))

  // Діапазон опонента залежно від сценарію: лімпер захищається LIMP_CALL,
  // колер проти рейзу — чартом захисту VS_RAISE.
  const villainRange = (pos: Position): ReadonlySet<Hand> =>
    isIso ? LIMP_CALL : VS_RAISE[bucket].call[HERO_CTX(pos)]

  for (const pos of ordered) {
    if (pos === heroPos) {
      seats.push({ pos, hole: heroHole, hero: true, stack, put: 0, folded: false })
      continue
    }
    const hand = pickWeighted(villainRange(pos), rng)
    if (hand === null) return null
    const hole = drawHand(deck, hand, rng)
    if (hole === null) return null
    seats.push({ pos, hole, hero: false, stack, put: 0, folded: false })
  }

  const board = drawCards(deck, 3, rng)
  if (board.length < 3) return null

  const heroIdx = seats.findIndex((s) => s.hero)
  const heroOrder = POSTFLOP_ORDER.indexOf(heroPos)
  const ip = callers.every((c) => POSTFLOP_ORDER.indexOf(c) < heroOrder)

  const dead = callers.includes('SB') || callers.includes('BB') ? 0.5 : 1.5
  const potBB = Math.round((raiseBB * (1 + callers.length) + dead) * 2) / 2

  return {
    line: 'aggressor',
    scenario,
    heroPos,
    seats,
    heroIdx,
    texture: texture(board).t,
    ip,
    deck,
    board,
    street: 'flop',
    potBB,
    bet: 0,
    raised: false,
    lastBetFraction: 0,
    acted: new Set<number>(),
    villainAggro: 0,
    delayed: false,
    streetHadBet: false,
    history: [
      isIso
        ? `Ти зробив ізо-рейз ${raiseBB}bb з ${heroPos}, колл — ${callers.join(', ')}.`
        : `Ти відкрив з ${heroPos} на ${BUILD.openBB}bb, колл — ${callers.join(', ')}.`,
    ],
    finished: null,
  }
}

/**
 * Роздає епізод. Rejection sampling підтягує частку роздач, де опонент має
 * силу: інакше чек-рейзи й барелі траплялись би надто рідко, щоб їх тренувати.
 * Карти після прийняття не підмінюються — шоудаун лишається чесним.
 */
export function buildEpisode(options: BuildOptions = {}): EpisodeState {
  const rng = options.rng ?? Math.random
  const share = options.strongShare ?? BUILD.strongShare
  const tries = options.maxTries ?? BUILD.maxTries
  const scenario = options.scenario ?? 'rfi'

  const wantStrong = rng() < share
  let fallback: EpisodeState | null = null

  for (let i = 0; i < tries; i++) {
    const ep = dealOnce(scenario, rng)
    if (ep === null) continue
    fallback ??= ep
    const hasStrong = ep.seats.some((s) => !s.hero && isStrong(evalHand(s.hole, ep.board).cat))
    if (hasStrong === wantStrong) return ep
  }

  if (fallback !== null) return fallback
  throw new Error('не вдалося роздати епізод')
}
