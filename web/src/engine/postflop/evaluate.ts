/**
 * Оцінка руки і текстури.
 *
 * evaluate/texture/hasStraight/straightDraw — порт із poker-trainer.html 1:1
 * (звіряється з __fixtures__/ref-postflop.json). Свідомі доповнення, яких у
 * референсі немає, бо він знає лише флоп:
 *   1. STRONG розщеплений на STRONG_MADE / STRONG_PAIR (див. types.ts);
 *   2. на пʼятикартковому борді дро не рахуються — добирати нема чого;
 *   3. boardEvents — прапорці подій борду для матриць терну й рівера.
 */

import type { Card } from '../types'
import type { BoardEvents, HandEval, PostCategory, Texture } from './types'

/**
 * Нижня карта стріту в наборі рангів, 0 — стріту немає.
 * Порт 1:1: цикл іде знизу, тобто повертає НАЙМОЛОДШИЙ стріт. Для evaluate це
 * лише булеве «стріт є», а для straightDraw — вікно, і саме таким воно було
 * в референсі. Не «виправляти».
 */
export function hasStraight(values: readonly number[]): number {
  const s = new Set(values)
  if (s.has(14)) s.add(1)
  for (let lo = 1; lo <= 10; lo++) {
    let ok = true
    for (let k = 0; k < 5; k++) {
      if (!s.has(lo + k)) {
        ok = false
        break
      }
    }
    if (ok) return lo
  }
  return 0
}

/** Скільки рангів добудовують стріт із участю карти героя: 2+ — двосторонній. */
export function straightDraw(
  all: readonly Card[],
  holeValues: readonly number[],
): 'oesd' | 'gutshot' | null {
  const rset = all.map((c) => c.v)
  let outs = 0
  for (let r = 2; r <= 14; r++) {
    if (rset.includes(r)) continue
    const lo = hasStraight([...rset, r])
    if (!lo) continue
    const win: number[] = []
    for (let k = 0; k < 5; k++) win.push(lo + k)
    const hv = holeValues.flatMap((v) => (v === 14 ? [14, 1] : [v]))
    if (hv.some((v) => win.includes(v))) outs++
  }
  return outs >= 2 ? 'oesd' : outs === 1 ? 'gutshot' : null
}

export function evalHand(hole: readonly Card[], board: readonly Card[]): HandEval {
  const all = [...hole, ...board]
  const bv = board.map((c) => c.v).sort((a, b) => b - a)
  const hv = hole.map((c) => c.v).sort((a, b) => b - a)
  const h0 = hv[0] ?? 0
  const h1 = hv[1] ?? 0
  const b0 = bv[0] ?? 0
  const b1 = bv[1] ?? 0

  const cnt = new Map<number, number>()
  const suitCnt = new Map<number, number>()
  for (const c of all) {
    cnt.set(c.v, (cnt.get(c.v) ?? 0) + 1)
    suitCnt.set(c.s, (suitCnt.get(c.s) ?? 0) + 1)
  }
  const holeSuits = hole.map((c) => c.s)

  const flushMade = [...suitCnt.values()].some((n) => n >= 5)
  const straightMade = hasStraight(all.map((c) => c.v)) > 0
  const isPocket = h0 === h1

  let made: 'STRONG' | 'MEDIUM' | 'WEAK' | null = null
  /** Дві пари й краще — саме це відрізняє STRONG_MADE від STRONG_PAIR. */
  let big = false
  let label = ''

  if (flushMade) {
    made = 'STRONG'
    big = true
    label = 'флеш'
  } else if (straightMade) {
    made = 'STRONG'
    big = true
    label = 'стріт'
  } else if (isPocket && bv.includes(h0)) {
    made = 'STRONG'
    big = true
    label = 'сет'
  } else if (!isPocket && (cnt.get(h0) === 3 || cnt.get(h1) === 3)) {
    made = 'STRONG'
    big = true
    label = 'трипс'
  } else if (!isPocket && bv.includes(h0) && bv.includes(h1)) {
    made = 'STRONG'
    big = true
    label = 'дві пари'
  } else if (isPocket) {
    if (h0 > b0) {
      made = 'STRONG'
      label = 'оверпара'
    } else if (h0 > b1) {
      made = 'MEDIUM'
      label = 'середня кишенькова пара'
    } else {
      made = 'WEAK'
      label = 'андерпара'
    }
  } else {
    const m = bv.includes(h0) ? h0 : bv.includes(h1) ? h1 : null
    if (m === null) {
      label = 'без пари'
    } else {
      const kicker = m === h0 ? h1 : h0
      if (m === b0) {
        if (kicker >= 10) {
          made = 'STRONG'
          label = 'топ-пара, сильний кікер'
        } else {
          made = 'MEDIUM'
          label = 'топ-пара, слабкий кікер'
        }
      } else if (m === b1) {
        made = 'MEDIUM'
        label = 'друга пара'
      } else {
        made = 'WEAK'
        label = 'третя пара'
      }
    }
  }

  // Дро живі, поки борд не повний. Референс цієї гілки не має — він далі флопу
  // не йде, а на рівері «дро» означало б добір з карти, якої не буде.
  const live = board.length < 5
  // Булеві, а не знайдена масть: індекс ♠ дорівнює 0, і перевірка на істинність
  // самої масті мовчки ковтала б усі пікові дро.
  const flushDraw =
    live && [...suitCnt.entries()].some(([s, n]) => n === 4 && holeSuits.includes(s))
  const backdoor =
    live && [...suitCnt.entries()].some(([s, n]) => n === 3 && holeSuits.includes(s))
  const sd = live ? straightDraw(all, hv) : null

  const over = made === null && h0 > b0 && h1 > b0

  const dl: string[] = []
  if (flushDraw && !flushMade) dl.push('флеш-дро')
  if (sd === 'oesd') dl.push('двосторонній стріт-дро')
  if (sd === 'gutshot') dl.push('гатшот')
  if (!flushDraw && backdoor && dl.length === 0) dl.push('беквдор-флеш')

  let cat: PostCategory
  if (made === 'STRONG') cat = big ? 'STRONG_MADE' : 'STRONG_PAIR'
  else if ((flushDraw && !flushMade) || sd === 'oesd')
    // Середня рука із сильним дро — теж «сильна», але парного роду.
    cat = made === 'MEDIUM' ? 'STRONG_PAIR' : 'DRAW'
  else if (made === 'MEDIUM') cat = 'MEDIUM'
  else if (made === 'WEAK') cat = 'WEAK'
  else if (sd === 'gutshot' || over) cat = 'WEAKDRAW'
  else cat = 'AIR'

  let full = label
  if (dl.length) full = (made ? `${label} + ` : '') + dl.join(' + ')
  if (!made && dl.length === 0) full = over ? 'дві оверкарти' : 'нічого'

  return { cat, label: full, madeFlush: flushMade }
}

/** Текстура флопу. Фіксується на флопі й далі не перераховується. */
export function texture(flop: readonly Card[]): { t: Texture; label: string } {
  const v = flop.map((c) => c.v).sort((a, b) => b - a)
  const v0 = v[0] ?? 0
  const v1 = v[1] ?? 0
  const v2 = v[2] ?? 0
  if (v0 === v1 || v1 === v2) return { t: 'PAIRED', label: 'спарена' }

  const su = new Map<number, number>()
  for (const c of flop) su.set(c.s, (su.get(c.s) ?? 0) + 1)
  const mx = Math.max(...su.values())

  let sc = 0
  if (mx === 3) sc += 2
  else if (mx === 2) sc += 1
  if (v0 - v1 <= 2 || v1 - v2 <= 2) sc += 1
  if (v0 - v2 <= 4) sc += 1

  return sc >= 2 ? { t: 'WET', label: 'мокра' } : { t: 'DRY', label: 'суха' }
}

export function boardEvents(board: readonly Card[]): BoardEvents {
  const suit = new Map<number, number>()
  const rank = new Map<number, number>()
  for (const c of board) {
    suit.set(c.s, (suit.get(c.s) ?? 0) + 1)
    rank.set(c.v, (rank.get(c.v) ?? 0) + 1)
  }
  const flopTop = Math.max(...board.slice(0, 3).map((c) => c.v))
  const last = board[board.length - 1]
  return {
    flushClosed: [...suit.values()].some((n) => n >= 3),
    boardPaired: [...rank.values()].some((n) => n >= 2),
    overcard: board.length > 3 && last !== undefined && last.v > flopTop,
  }
}
