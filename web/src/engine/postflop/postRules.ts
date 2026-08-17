/**
 * Таблиці правил для екрана «Схема рішень».
 *
 * Рядки НЕ пишуться руками. Для кожної таблиці перебирається повний простір
 * контекстів, а дія і пояснення беруться з матриць §5 — тих самих, які оцінюють
 * рішення в тренуванні. Тому екран правил не може розійтися з рушієм: розійтись
 * можна лише з тим, що написано окремо, а тут не написано нічого окремо.
 *
 * Зведення працює так: групуємо контексти за оголошеними вимірами, потім для
 * кожної категорії руки викидаємо виміри, які її рішення не змінюють. Саме це
 * перетворює 42 комбінації флопу на дев'ять людських рядків. Якщо матриця почне
 * залежати від виміру, якого таблиця не оголосила, групи стануть неоднорідними
 * і це зловить тест повноти (postRules.test.ts).
 */

import type { BetContext, Decision } from './matrixBet'
import { decideBet } from './matrixBet'
import type { DefendContext } from './matrixDefend'
import { decideDefend } from './matrixDefend'
import {
  FACING_LABEL,
  POST_ACT_LABEL,
  POST_CATEGORIES,
  POST_CAT_LABEL,
  STREET_LABEL,
  TEXTURES,
  TEX_LABEL,
  type Facing,
  type PostAction,
  type PostCategory,
  type PostLine,
  type Street,
} from './types'

export type BetDim = 'street' | 'texture' | 'ip' | 'delayed' | 'flush' | 'overcard'
export type DefendDim = 'street' | 'facing' | 'repeat'

export interface RuleRow {
  /** Людська назва категорії — або перелік категорій зі спільним рішенням. */
  readonly cat: string
  readonly situation: string
  readonly action: string
  readonly why: string
}

interface SpecBase {
  readonly id: string
  readonly title: string
  /** Розділ спеки — на екрані видно, звідки правило. */
  readonly source: string
  /** Досяжні категорії: на рівері дро не існують (спека §4). */
  readonly cats?: readonly PostCategory[]
}

export interface BetSpec extends SpecBase {
  readonly kind: 'bet'
  readonly streets: readonly Street[]
  readonly line: PostLine
  readonly nOpps: number
  /** Чиї позиції перебирати. Для §5.1а — лише OOP: правило тільки про нього. */
  readonly ips?: readonly boolean[]
  readonly dims: readonly BetDim[]
}

export interface DefendSpec extends SpecBase {
  readonly kind: 'defend'
  readonly streets: readonly Street[]
  readonly facings: readonly Facing[]
  readonly nOpps: number
  readonly vsCbet: boolean
  readonly dims: readonly DefendDim[]
}

export interface RuleTable {
  readonly id: string
  readonly title: string
  readonly source: string
  readonly rows: readonly RuleRow[]
  /** Специфікація, з якої таблиця згенерована — потрібна тестам повноти. */
  readonly spec: BetSpec | DefendSpec
  /** Службове: категорія → виміри, що лишились після скорочення. */
  readonly keep: ReadonlyMap<PostCategory, readonly number[]>
  /** Службове: `категорія|мітки` → рядок, який покриває ці контексти. */
  readonly index: ReadonlyMap<string, RuleRow>
}

const POS_LABEL = (ip: boolean): string => (ip ? 'у позиції' : 'поза позицією')

const BET_DIM: Readonly<Record<BetDim, (c: BetContext) => string>> = {
  street: (c) => STREET_LABEL[c.street],
  texture: (c) => `дошка ${TEX_LABEL[c.texture]}`,
  ip: (c) => POS_LABEL(c.ip),
  delayed: (c) => (c.delayed ? 'після чек-чеку' : 'на попередній вулиці була ставка'),
  flush: (c) =>
    c.events.flushClosed && !c.madeFlush ? 'масть закрилась, рука не флеш' : 'масть не зібралась',
  overcard: (c) => (c.events.overcard ? 'нова карта старша за флоп' : 'карта нічого не змінила'),
}

const DEFEND_DIM: Readonly<Record<DefendDim, (c: DefendContext) => string>> = {
  street: (c) => STREET_LABEL[c.street],
  facing: (c) => FACING_LABEL[c.facing],
  repeat: (c) => (c.repeatAggro ? 'друга куля опонента' : 'перша агресія в руці'),
}

export function allBetContexts(t: RuleTable): BetContext[] {
  const s = t.spec
  if (s.kind !== 'bet') return []
  const out: BetContext[] = []
  for (const street of s.streets)
    for (const cat of s.cats ?? POST_CATEGORIES)
      for (const texture of TEXTURES)
        for (const ip of s.ips ?? [true, false])
          for (const delayed of [true, false])
            for (const madeFlush of [true, false])
              for (const flushClosed of [true, false])
                for (const boardPaired of [true, false])
                  for (const overcard of [true, false])
                    out.push({
                      street,
                      line: s.line,
                      cat,
                      texture,
                      nOpps: s.nOpps,
                      ip,
                      delayed,
                      madeFlush,
                      events: { flushClosed, boardPaired, overcard },
                    })
  return out
}

export function allDefendContexts(t: RuleTable): DefendContext[] {
  const s = t.spec
  if (s.kind !== 'defend') return []
  const out: DefendContext[] = []
  for (const street of s.streets)
    for (const facing of s.facings)
      for (const cat of s.cats ?? POST_CATEGORIES)
        for (const repeatAggro of [true, false])
          out.push({ street, facing, cat, nOpps: s.nOpps, repeatAggro, vsCbet: s.vsCbet })
  return out
}

interface Group {
  readonly cat: PostCategory
  readonly labels: readonly string[]
  readonly action: PostAction
  readonly why: string
  /** Скільки контекстів звелось у цю групу — за цим шукаємо найбільшу. */
  readonly size: number
}

const decisionKey = (g: Group): string => `${g.action}|${g.why}`
const labelKey = (labels: readonly string[], keep: readonly number[]): string =>
  keep.map((i) => labels[i]).join(' · ')

/** Групує контексти за категорією і мітками вимірів. */
function groupContexts<C>(
  contexts: readonly C[],
  catOf: (c: C) => PostCategory,
  labelsOf: (c: C) => string[],
  decide: (c: C) => Decision,
): Group[] {
  const seen = new Map<string, { g: Group; n: number }>()
  for (const c of contexts) {
    const labels = labelsOf(c)
    const cat = catOf(c)
    const key = `${cat}|${labels.join(' · ')}`
    const hit = seen.get(key)
    if (hit) {
      hit.n++
      continue
    }
    const d = decide(c)
    seen.set(key, { g: { cat, labels, action: d.action, why: d.why, size: 0 }, n: 1 })
  }
  return [...seen.values()].map(({ g, n }) => ({ ...g, size: n }))
}

/** Групи однорідні, якщо однакові мітки завжди дають однакове рішення. */
function homogeneous(groups: readonly Group[], keep: readonly number[]): boolean {
  const seen = new Map<string, string>()
  for (const g of groups) {
    const key = labelKey(g.labels, keep)
    const val = decisionKey(g)
    const prev = seen.get(key)
    if (prev !== undefined && prev !== val) return false
    seen.set(key, val)
  }
  return true
}

/** Жадібно викидає виміри, які рішення цієї категорії не змінюють. */
function reduceDims(groups: readonly Group[], dimCount: number): number[] {
  let keep = Array.from({ length: dimCount }, (_, i) => i)
  for (let i = 0; i < dimCount; i++) {
    const candidate = keep.filter((k) => k !== i)
    if (homogeneous(groups, candidate)) keep = candidate
  }
  return keep
}

interface Built {
  readonly row: RuleRow
  readonly cat: PostCategory
  /** Ключі `категорія|мітки`, які цей рядок покриває. */
  readonly keys: readonly string[]
  readonly rest: boolean
}

/**
 * Прибирає з підпису виміри, за якими цей набір випадків замкнений: якщо рядок
 * покриває і «мокра · у позиції», і «мокра · поза позицією», то позиція в
 * підписі — шум, і чесніше написати просто «мокра».
 */
function dropClosedDims(
  vectors: readonly (readonly string[])[],
  values: readonly (readonly string[])[],
): number[] {
  const first = vectors[0]
  if (!first) return []
  let keep = first.map((_, i) => i)

  for (let i = 0; i < first.length; i++) {
    if (!keep.includes(i)) continue
    const own = values[i] ?? []
    // Набір перераховується щоразу: після викинутого виміру він інший.
    const has = new Set(vectors.map((v) => keep.map((k) => v[k]).join('|')))
    // Замкненість: підміна значення цього виміру лишає нас у тому самому наборі.
    const closed = vectors.every((v) =>
      own.every((x) => has.has(keep.map((k) => (k === i ? x : v[k])).join('|'))),
    )
    if (closed) keep = keep.filter((k) => k !== i)
  }
  return keep
}

/**
 * Рядки однієї категорії. Групи з однаковим рішенням склеюються; найбільша з
 * них, якщо покриває більше двох комбінацій, підписується «решта» — інакше
 * підпис перетворився б на нечитабельний перелік усіх випадків.
 */
function buildRows(cat: PostCategory, groups: readonly Group[], dimCount: number): Built[] {
  const keep = reduceDims(groups, dimCount)

  // Значення кожного виміру, які взагалі трапляються в цієї категорії — потрібні,
  // щоб зрозуміти, чи набір випадків замкнений за виміром.
  const values = keep.map((i) => [...new Set(groups.map((g) => g.labels[i] ?? ''))])

  // Одна група на кожен набір скорочених міток, у порядку першої появи.
  const distinct = new Map<string, Group>()
  const sizes = new Map<string, number>()
  for (const g of groups) {
    const k = labelKey(g.labels, keep)
    sizes.set(k, (sizes.get(k) ?? 0) + g.size)
    if (!distinct.has(k)) distinct.set(k, g)
  }

  const byDecision = new Map<
    string,
    { keys: string[]; vectors: string[][]; g: Group; size: number }
  >()
  for (const [k, g] of distinct) {
    const dk = decisionKey(g)
    const vector = keep.map((i) => g.labels[i] ?? '')
    const hit = byDecision.get(dk)
    const size = sizes.get(k) ?? 0
    if (hit) {
      hit.keys.push(k)
      hit.vectors.push(vector)
      hit.size += size
      continue
    }
    byDecision.set(dk, { keys: [k], vectors: [vector], g, size })
  }

  const buckets = [...byDecision.values()]
  // Найбільший набір — той, що стане «рештою випадків».
  const biggest = buckets.reduce<(typeof buckets)[number] | undefined>(
    (a, b) => (a === undefined || b.size > a.size ? b : a),
    undefined,
  )

  const rows = buckets.map((b) => {
    const single = distinct.size === 1
    const rest = !single && b.vectors.length > 2 && b === biggest
    // Підпис описує лише ті виміри, які в межах цього рядка справді щось значать.
    const shown = dropClosedDims(b.vectors, values)
    const labels = [...new Set(b.vectors.map((v) => shown.map((i) => v[i]).join(' · ')))]
    const situation = single
      ? 'будь-яка ситуація'
      : rest
        ? 'решта випадків'
        : labels.length === 0 || labels[0] === ''
          ? 'будь-яка ситуація'
          : labels.join(' / ')
    return {
      row: {
        cat: POST_CAT_LABEL[cat],
        situation,
        action: POST_ACT_LABEL[b.g.action],
        why: b.g.why,
      },
      cat,
      keys: b.keys.map((k) => `${cat}|${k}`),
      rest,
    }
  })

  // «Решта випадків» читається як виняток із попередніх рядків — значить, стоїть
  // після них, а не перед.
  return [...rows.filter((r) => !r.rest), ...rows.filter((r) => r.rest)]
}

/**
 * Категорії з однаковим рішенням і однаковою ситуацією зводяться в один рядок:
 * два підтипи STRONG на рівері — це «Сильна рука / Сильна пара», а не два
 * однакові рядки поспіль.
 */
function mergeCategories(built: readonly Built[], cats: readonly PostCategory[]): {
  rows: RuleRow[]
  index: Map<string, RuleRow>
} {
  const buckets = new Map<string, { row: RuleRow; cats: PostCategory[]; keys: string[]; rest: boolean }>()
  const order: string[] = []
  for (const b of built) {
    const key = `${b.row.situation}|${b.row.action}|${b.row.why}`
    const hit = buckets.get(key)
    if (hit) {
      if (!hit.cats.includes(b.cat)) hit.cats.push(b.cat)
      hit.keys.push(...b.keys)
      continue
    }
    buckets.set(key, { row: b.row, cats: [b.cat], keys: [...b.keys], rest: b.rest })
    order.push(key)
  }

  const rows: RuleRow[] = []
  const index = new Map<string, RuleRow>()
  const tail: RuleRow[] = []
  const tailKeys: string[][] = []

  for (const key of order) {
    const b = buckets.get(key)
    if (!b) continue
    const catLabel =
      b.cats.length === cats.length
        ? 'будь-яка рука'
        : b.cats.length > 2
          ? 'решта рук'
          : b.cats.map((c) => POST_CAT_LABEL[c]).join(' і ')
    const row: RuleRow = { ...b.row, cat: catLabel }
    // «Решта рук» і «решта випадків» — завжди в кінці таблиці.
    if (catLabel === 'решта рук') {
      tail.push(row)
      tailKeys.push(b.keys)
    } else {
      rows.push(row)
    }
    for (const k of b.keys) index.set(k, row)
  }

  for (let i = 0; i < tail.length; i++) {
    const row = tail[i]
    if (!row) continue
    rows.push(row)
    for (const k of tailKeys[i] ?? []) index.set(k, row)
  }

  return { rows, index }
}

function buildTable(spec: BetSpec | DefendSpec): RuleTable {
  const cats = spec.cats ?? POST_CATEGORIES
  const shell: RuleTable = {
    id: spec.id,
    title: spec.title,
    source: spec.source,
    rows: [],
    spec,
    keep: new Map(),
    index: new Map(),
  }

  const groups =
    spec.kind === 'bet'
      ? groupContexts(
          allBetContexts(shell),
          (c) => c.cat,
          (c) => spec.dims.map((d) => BET_DIM[d](c)),
          decideBet,
        )
      : groupContexts(
          allDefendContexts(shell),
          (c) => c.cat,
          (c) => spec.dims.map((d) => DEFEND_DIM[d](c)),
          decideDefend,
        )

  const keep = new Map<PostCategory, readonly number[]>()
  const built: Built[] = []
  for (const cat of cats) {
    const mine = groups.filter((g) => g.cat === cat)
    if (mine.length === 0) continue
    keep.set(cat, reduceDims(mine, spec.dims.length))
    built.push(...buildRows(cat, mine, spec.dims.length))
  }

  const { rows, index } = mergeCategories(built, cats)
  return { ...shell, rows, keep, index }
}

const rowFor = (
  t: RuleTable,
  cat: PostCategory,
  labels: readonly string[],
): RuleRow | undefined => {
  const keep = t.keep.get(cat)
  if (!keep) return undefined
  return t.index.get(`${cat}|${labelKey(labels, keep)}`)
}

export function betRowFor(t: RuleTable, c: BetContext): RuleRow | undefined {
  if (t.spec.kind !== 'bet') return undefined
  return rowFor(t, c.cat, t.spec.dims.map((d) => BET_DIM[d](c)))
}

export function defendRowFor(t: RuleTable, c: DefendContext): RuleRow | undefined {
  if (t.spec.kind !== 'defend') return undefined
  return rowFor(t, c.cat, t.spec.dims.map((d) => DEFEND_DIM[d](c)))
}

/** На рівері дро не існують: доїхало — стало made-рукою, ні — стало AIR. */
const RIVER_CATS: readonly PostCategory[] = [
  'STRONG_MADE',
  'STRONG_PAIR',
  'MEDIUM',
  'WEAK',
  'AIR',
]

const SPECS: readonly (BetSpec | DefendSpec)[] = [
  {
    kind: 'bet',
    id: 'flop-hu',
    title: 'Флоп · чекнуто до тебе · хедз-ап',
    source: '§5.1 · порт із poker-trainer.html 1:1',
    streets: ['flop'],
    line: 'aggressor',
    nOpps: 1,
    dims: ['texture', 'ip'],
  },
  {
    kind: 'bet',
    id: 'flop-caller-oop',
    title: 'Флоп · лінія колера, поза позицією',
    source: '§5.1а',
    streets: ['flop'],
    line: 'caller',
    nOpps: 1,
    ips: [false],
    dims: [],
  },
  {
    kind: 'bet',
    id: 'turn',
    title: 'Терн · чекнуто до тебе',
    source: '§5.2',
    streets: ['turn'],
    line: 'aggressor',
    nOpps: 1,
    dims: ['flush', 'delayed', 'overcard', 'ip'],
  },
  {
    kind: 'bet',
    id: 'river',
    title: 'Рівер · чекнуто до тебе',
    source: '§5.3',
    streets: ['river'],
    line: 'aggressor',
    nOpps: 1,
    cats: RIVER_CATS,
    dims: [],
  },
  {
    kind: 'bet',
    id: 'multi-bet',
    title: 'Мультипот · чекнуто до тебе',
    source: '§5.1–§5.2 · мультивей',
    streets: ['flop', 'turn', 'river'],
    line: 'aggressor',
    nOpps: 2,
    dims: ['street', 'ip'],
  },
  {
    kind: 'defend',
    id: 'vs-cbet',
    title: 'Проти c-bet агресора · флоп',
    source: '§5.4 · лінія колера',
    streets: ['flop'],
    facings: ['small_bet', 'big_bet'],
    nOpps: 1,
    vsCbet: true,
    dims: ['facing'],
  },
  {
    kind: 'defend',
    id: 'vs-bet-flop',
    title: 'Проти будь-якої іншої ставки · флоп',
    source: '§5.5',
    streets: ['flop'],
    facings: ['small_bet', 'big_bet'],
    nOpps: 1,
    vsCbet: false,
    dims: ['facing', 'repeat'],
  },
  {
    kind: 'defend',
    id: 'vs-bet-turn',
    title: 'Проти ставки · терн',
    source: '§5.5',
    streets: ['turn'],
    facings: ['small_bet', 'big_bet'],
    nOpps: 1,
    vsCbet: false,
    dims: ['facing', 'repeat'],
  },
  {
    kind: 'defend',
    id: 'vs-bet-river',
    title: 'Проти ставки · рівер',
    source: '§5.5 · рівер',
    streets: ['river'],
    facings: ['small_bet', 'big_bet'],
    nOpps: 1,
    vsCbet: false,
    cats: RIVER_CATS,
    dims: ['facing', 'repeat'],
  },
  {
    kind: 'defend',
    id: 'vs-raise',
    title: 'Проти рейзу',
    source: '§5.6',
    streets: ['flop', 'turn', 'river'],
    facings: ['raise'],
    nOpps: 1,
    vsCbet: false,
    dims: ['street'],
  },
  {
    kind: 'defend',
    id: 'multi-defend',
    title: 'Мультивей проти агресії',
    source: '§5.5–§5.6 · мультивей-модифікатор',
    streets: ['flop', 'turn'],
    facings: ['small_bet', 'big_bet', 'raise'],
    nOpps: 2,
    vsCbet: false,
    dims: ['facing', 'repeat'],
  },
]

export const RULE_TABLES: readonly RuleTable[] = SPECS.map(buildTable)
