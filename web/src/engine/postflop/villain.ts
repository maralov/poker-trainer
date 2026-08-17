/**
 * Профіль опонента: лузово-пасивний гравець мікролімітів.
 *
 * Колле забагато, рейзить майже виключно силу, блефує рідко. Саме цей профіль
 * експлуатують матриці §5 — тому числа тут не «баланс», а модель поля.
 * Усі частоти — продуктові параметри зі спеки §6, змінювати їх свідомо.
 */

import type { Rng } from '../types'
import { isStrong, type PostCategory, type Street } from './types'

/** Опонент бачить свою руку тим самим оцінювачем; підтипи STRONG не розрізняються. */
type CoarseCat = 'STRONG' | 'MEDIUM' | 'WEAK' | 'DRAW' | 'WEAKDRAW' | 'AIR'

// isStrong() повертає boolean, а не type predicate, тож звичайний тернарник
// не звужує тип у гілці «інакше» — switch звужує його явно, без правок
// спільного types.ts заради одного локального перетворення.
const coarse = (c: PostCategory): CoarseCat => {
  switch (c) {
    case 'STRONG_MADE':
    case 'STRONG_PAIR':
      return 'STRONG'
    default:
      return c
  }
}

type CatFreq = Readonly<Record<CoarseCat, number>>

export interface VillainProfile {
  /** Ставка, коли чекнуто до нього. */
  readonly bet: Readonly<Record<Street, Readonly<Record<PostCategory, number>>>>
  /** C-bet флопу — лише для опонента, який був префлоп-агресором. */
  readonly cbet: Readonly<Record<PostCategory, number>>
  /** Донк-бет OOP до дії героя. Лише для опонента, який агресором НЕ був. */
  readonly donk: CatFreq
  /** Рейз у відповідь на ставку героя: [мала, велика]. */
  readonly raise: Readonly<Record<CoarseCat, readonly [number, number]>>
  /** Колл у відповідь на ставку героя: [мала, велика]. Решта — фолд. */
  readonly call: Readonly<Record<CoarseCat, readonly [number, number]>>
  /** Рейз на рівері однаковий незалежно від сайзу. */
  readonly riverRaise: number
}

const BET_FLOP: CatFreq = { STRONG: 0.6, MEDIUM: 0.25, WEAK: 0.1, DRAW: 0.3, WEAKDRAW: 0.05, AIR: 0.05 }
const BET_TURN: CatFreq = { STRONG: 0.7, MEDIUM: 0.2, WEAK: 0.05, DRAW: 0.25, WEAKDRAW: 0.05, AIR: 0.05 }
// На рівері дро не існують — рядки лишаються нулями заради повноти типу.
const BET_RIVER: CatFreq = { STRONG: 0.75, MEDIUM: 0.25, WEAK: 0.05, DRAW: 0, WEAKDRAW: 0, AIR: 0.05 }

/**
 * C-bet префлоп-агресора на флопі. Окремий рядок, а не bet-таблиця: агресор
 * мікрополя ставить флоп майже автоматично, і саме на цьому стоїть §5.4 —
 * єдиний контекст, де у ставці опонента є повітря. Терн і рівер лишаються на
 * bet: друга куля пасивного гравця вже означає силу («one and done»).
 */
const CBET_FLOP: CatFreq = { STRONG: 0.85, MEDIUM: 0.7, WEAK: 0.6, DRAW: 0.7, WEAKDRAW: 0.6, AIR: 0.55 }

/** Розгортає коротку таблицю на всі сім категорій. */
const expand = (f: CatFreq): Readonly<Record<PostCategory, number>> => ({
  STRONG_MADE: f.STRONG,
  STRONG_PAIR: f.STRONG,
  MEDIUM: f.MEDIUM,
  WEAK: f.WEAK,
  DRAW: f.DRAW,
  WEAKDRAW: f.WEAKDRAW,
  AIR: f.AIR,
})

export const VILLAIN: VillainProfile = {
  bet: { flop: expand(BET_FLOP), turn: expand(BET_TURN), river: expand(BET_RIVER) },
  cbet: expand(CBET_FLOP),
  donk: { STRONG: 0.3, MEDIUM: 0, WEAK: 0, DRAW: 0.2, WEAKDRAW: 0, AIR: 0 },
  raise: {
    STRONG: [0.5, 0.4],
    MEDIUM: [0, 0],
    WEAK: [0, 0],
    DRAW: [0.05, 0.05],
    WEAKDRAW: [0, 0],
    AIR: [0.02, 0.02],
  },
  call: {
    STRONG: [0.5, 0.6],
    MEDIUM: [0.9, 0.6],
    WEAK: [0.7, 0.3],
    DRAW: [0.9, 0.85],
    WEAKDRAW: [0.6, 0.25],
    AIR: [0.13, 0.05],
  },
  riverRaise: 0.3,
}

export type VillainMove = 'check' | 'bet' | 'fold' | 'call' | 'raise'

/** Сайз опонента корелює з силою — реальний телл мікрополя (спека §3.2, §13). */
export const villainBetFraction = (cat: PostCategory): 0.33 | 0.66 =>
  isStrong(cat) || cat === 'DRAW' ? 0.66 : 0.33

/** Чекнуто до опонента: ставить чи чекає. */
export function villainOpen(cat: PostCategory, street: Street, rng: Rng): 'check' | 'bet' {
  return rng() < VILLAIN.bet[street][cat] ? 'bet' : 'check'
}

/**
 * C-bet агресора: флоп лінії колера. Пізніші вулиці беруть звичайну
 * bet-таблицю — другий барель у моделі вже означає силу.
 */
export function villainCbet(cat: PostCategory, rng: Rng): 'check' | 'bet' {
  return rng() < VILLAIN.cbet[cat] ? 'bet' : 'check'
}

/** Донк-бет: опонент-НЕагресор OOP діє першим, до героя. */
export function villainDonk(cat: PostCategory, street: Street, rng: Rng): 'check' | 'bet' {
  if (street === 'river' && (cat === 'DRAW' || cat === 'WEAKDRAW')) return 'check'
  return rng() < VILLAIN.donk[coarse(cat)] ? 'bet' : 'check'
}

/**
 * Відповідь на ставку героя. `capped` — на вулиці вже був рейз, тож рейз-частка
 * згортається в колл: одна підвищена ставка на вулицю (спека §3.3).
 */
export function villainVsBet(
  cat: PostCategory,
  street: Street,
  big: boolean,
  capped: boolean,
  rng: Rng,
): 'fold' | 'call' | 'raise' {
  const c = coarse(cat)
  const i = big ? 1 : 0
  const isRiverStrong = street === 'river' && c === 'STRONG'

  // На рівері сила рейзить фіксовані .30 незалежно від сайзу (спека §6, riverRaise).
  // Колл у таблиці — це залишок за вирахуванням «малого»/«великого» рейзу (.50/.40),
  // тож підставляти його поряд із фіксованими .30 напряму не можна: сума з'їхала б
  // нижче 1, і сила стала б фолдити на рівері — а вона не фолдить ніколи (§6).
  // Тому калл на рівері добирає решту до 1 сам, а не береться з таблиці.
  const raiseFreq = isRiverStrong ? VILLAIN.riverRaise : (VILLAIN.raise[c][i] ?? 0)
  const callFreq = isRiverStrong ? 1 - VILLAIN.riverRaise : (VILLAIN.call[c][i] ?? 0)

  const roll = rng()
  if (!capped && roll < raiseFreq) return 'raise'
  // Cap не робить руку слабшою: рейзова частка стає коллом, а не фолдом.
  if (roll < raiseFreq + callFreq) return 'call'
  return 'fold'
}
