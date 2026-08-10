/**
 * Побудова спотів. Порт функції preBuildSpot з poker-trainer.html.
 *
 * Відмінності від референсу, свідомі:
 *   1. Rng інжектується — інакше тести неможливі.
 *   2. Мапа `missed` приходить аргументом, а не читається з глобального DB.
 *   3. Спот несе villainPos і limpers, щоб журнал спроб зберігав повний контекст.
 */

import { WEIGHTED, dealFromHand, pick, union } from './cards'
import {
  BUCKET,
  HERO_CTX,
  NOTES,
  TEMPTING,
  TIGHTER2,
  VS_3BET,
  VS_RAISE,
  isoRange,
  positionAt,
  rfiRange,
} from './ranges'
import {
  ACTION_ORDER,
  type Action,
  type ActionOption,
  type Hand,
  type Position,
  type Rng,
  type Scenario,
  type SeatAction,
  type Spot,
} from './types'

/** Примусові параметри споту — використовує drill, щоб повторити конкретну руку. */
export interface ForceSpot {
  readonly scen: Scenario
  readonly heroPos: Position
  /** Конкретна рука; null — згенерувати контрольну руку з тієї ж позиції. */
  readonly hand: Hand | null
  /** Руки з пулу помилок, які контрольна рука не має повторювати. */
  readonly ban?: readonly Hand[]
}

export interface BuildSpotOptions {
  /** Активні сценарії. Ігнорується, якщо заданий force. */
  readonly scenarios?: readonly Scenario[]
  /** Ключі `scen|pos|hand` з вагою помилки — підмішуються частіше. */
  readonly missed?: Readonly<Record<string, number>>
  readonly force?: ForceSpot
  readonly rng?: Rng
}

const emptySeats = (): Record<Position, SeatAction | null> => ({
  UTG: null,
  'UTG+1': null,
  MP: null,
  LJ: null,
  HJ: null,
  CO: null,
  BTN: null,
  SB: null,
  BB: null,
})

const OPT_RAISE_FOLD = (raiseLabel: string): ActionOption[] => [
  { k: 'raise', l: raiseLabel, c: 'primary' },
  { k: 'fold', l: 'Фолд', c: 'ghost' },
]

const OPT_THREE_WAY = (raiseLabel: string): ActionOption[] => [
  { k: 'raise', l: raiseLabel, c: 'primary' },
  { k: 'call', l: 'Колл', c: 'mid' },
  { k: 'fold', l: 'Фолд', c: 'ghost' },
]

/** Назва дії в тексті вердикту — залежить від сценарію. */
export const actionName = (k: Action, scen: Scenario): string =>
  k === 'call'
    ? 'колл'
    : k === 'fold'
      ? 'фолд'
      : scen === 'vsraise'
        ? '3-бет'
        : scen === 'vs3bet'
          ? '4-бет'
          : scen === 'iso'
            ? 'ізо-рейз'
            : 'рейз'

interface ScenarioShape {
  heroPos: Position
  seats: Record<Position, SeatAction | null>
  ranges: { raise: ReadonlySet<Hand>; call: ReadonlySet<Hand> }
  options: ActionOption[]
  prompt: string
  potBB: number
  explainExtra: string
  villainPos: Position | null
  limpers: number | null
}

function buildRfi(force: ForceSpot | undefined, rng: Rng): ScenarioShape {
  const heroPos = force ? force.heroPos : pick(ACTION_ORDER.slice(0, 8), rng)
  const seats = emptySeats()
  for (const p of ACTION_ORDER.slice(0, ACTION_ORDER.indexOf(heroPos))) seats[p] = 'fold'
  return {
    heroPos,
    seats,
    ranges: { raise: rfiRange(heroPos), call: new Set() },
    options: OPT_RAISE_FOLD('Рейз 3bb'),
    prompt: 'Усі перед тобою скинули. Твій хід.',
    potBB: 1.5,
    explainExtra: NOTES[heroPos],
    villainPos: null,
    limpers: null,
  }
}

function buildIso(force: ForceSpot | undefined, rng: Rng): ScenarioShape {
  // hi ≥ 1: на UTG перед тобою нікого немає, лімпувати нікому.
  const hi = force ? Math.max(1, ACTION_ORDER.indexOf(force.heroPos)) : 1 + Math.floor(rng() * 8)
  const heroPos = positionAt(hi)
  const before = ACTION_ORDER.slice(0, hi)
  const nLimp = rng() < 0.55 ? 1 : 2

  const limpers: Position[] = []
  const pool: Position[] = [...before]
  for (let k = 0; k < Math.min(nLimp, pool.length); k++) {
    const [taken] = pool.splice(Math.floor(rng() * pool.length), 1)
    if (taken !== undefined) limpers.push(taken)
  }

  const seats = emptySeats()
  for (const p of before) seats[p] = limpers.includes(p) ? 'limp' : 'fold'

  const useRange = limpers.length >= 2 ? isoRange(TIGHTER2[heroPos]) : isoRange(heroPos)
  return {
    heroPos,
    seats,
    ranges: { raise: useRange, call: new Set() },
    options: OPT_RAISE_FOLD('Ізо-рейз'),
    prompt: `${limpers.length === 1 ? 'Лімпер' : 'Два лімпери'} попереду. Розмір ізо-рейзу: ${4 + limpers.length}bb.`,
    potBB: 1.5 + limpers.length,
    explainExtra:
      limpers.length >= 2
        ? "Проти двох лімперів звужуйся на дві позиції: мультипот з'їдає маргінальні руки."
        : 'Оверлімп тут свідомо відсутній — на мікролімітах це чистий злив. Або ізолюйся, або скидай.',
    villainPos: null,
    limpers: limpers.length,
  }
}

function buildVsRaise(force: ForceSpot | undefined, rng: Rng): ScenarioShape {
  let ri: number
  let hi: number
  if (force) {
    hi = Math.max(1, ACTION_ORDER.indexOf(force.heroPos))
    ri = Math.floor(rng() * Math.min(hi, 7))
  } else {
    ri = Math.floor(rng() * 7)
    hi = ri + 1 + Math.floor(rng() * (8 - ri))
  }
  const raiser = positionAt(ri)
  const heroPos = positionAt(hi)

  const seats = emptySeats()
  for (const p of ACTION_ORDER.slice(0, ri)) seats[p] = 'fold'
  seats[raiser] = 'raise'
  for (const p of ACTION_ORDER.slice(ri + 1, hi)) seats[p] = 'fold'

  const def = VS_RAISE[BUCKET(raiser)]
  return {
    heroPos,
    seats,
    ranges: { raise: def.raise, call: def.call[HERO_CTX(heroPos)] },
    options: OPT_THREE_WAY('3-бет'),
    prompt: `Рейз 3bb з ${raiser}. Ти на ${heroPos}.`,
    potBB: 4.5,
    explainExtra: def.note,
    villainPos: raiser,
    limpers: null,
  }
}

function buildVs3bet(force: ForceSpot | undefined, rng: Rng): ScenarioShape {
  // hi ≤ 6: після BTN відкрити й отримати 3-бет вже нікому.
  const hi = force ? Math.min(6, ACTION_ORDER.indexOf(force.heroPos)) : Math.floor(rng() * 7)
  const heroPos = positionAt(hi)
  const ti = hi + 1 + Math.floor(rng() * (8 - hi))
  const threeBettor = positionAt(ti)

  const seats = emptySeats()
  for (const p of ACTION_ORDER.slice(0, hi)) seats[p] = 'fold'
  seats[heroPos] = 'raise'
  for (const p of ACTION_ORDER.slice(hi + 1, ti)) seats[p] = 'fold'
  seats[threeBettor] = '3bet'

  return {
    heroPos,
    seats,
    ranges: { raise: VS_3BET.raise, call: VS_3BET.call },
    options: OPT_THREE_WAY('4-бет'),
    prompt: `Ти відкрив з ${heroPos}, ${threeBettor} поставив 3-бет 10bb.`,
    potBB: 14.5,
    explainExtra: VS_3BET.note,
    villainPos: threeBettor,
    limpers: null,
  }
}

export function buildSpot(options: BuildSpotOptions = {}): Spot {
  const rng = options.rng ?? Math.random
  const force = options.force
  const missed = options.missed ?? {}
  const scenarios = options.scenarios ?? ['rfi']
  const scen: Scenario = force ? force.scen : pick(scenarios, rng)

  const shape =
    scen === 'rfi'
      ? buildRfi(force, rng)
      : scen === 'iso'
        ? buildIso(force, rng)
        : scen === 'vsraise'
          ? buildVsRaise(force, rng)
          : buildVs3bet(force, rng)

  const relevant = [...union(shape.ranges.raise, shape.ranges.call, TEMPTING)]

  let hand: Hand
  let isControl = false
  if (force && force.hand !== null) {
    hand = force.hand
  } else if (force) {
    // Контрольна рука: та сама позиція, але свідомо НЕ з пулу помилок.
    isControl = true
    const ban = new Set(force.ban ?? [])
    const cand = relevant.filter((h) => !ban.has(h))
    hand = pick(cand.length ? cand : relevant, rng)
  } else {
    const missedKeys = Object.keys(missed).filter(
      (k) => (missed[k] ?? 0) > 0 && k.startsWith(`${scen}|`),
    )
    // Одне число r обслуговує обидві розвилки — так само, як у референсі.
    const r = rng()
    if (missedKeys.length >= 4 && r < 0.25) {
      hand = pick(missedKeys, rng).split('|')[2] ?? pick(relevant, rng)
    } else {
      hand = r < 0.7 ? pick(relevant, rng) : pick(WEIGHTED, rng)
    }
  }

  const correct: Action = shape.ranges.raise.has(hand)
    ? 'raise'
    : shape.ranges.call.has(hand)
      ? 'call'
      : 'fold'

  return {
    scen,
    heroPos: shape.heroPos,
    seats: shape.seats,
    ranges: shape.ranges,
    options: shape.options,
    prompt: shape.prompt,
    potBB: shape.potBB,
    correct,
    hand,
    cards: dealFromHand(hand, rng),
    explainExtra: shape.explainExtra,
    drill: force !== undefined,
    isControl,
    villainPos: shape.villainPos,
    limpers: shape.limpers,
  }
}
