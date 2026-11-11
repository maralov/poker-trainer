/**
 * Формати столу. Кожен формат — це набір місць і власні діапазони; логіка
 * побудови спотів, ворота і діагностика однакові для всіх і беруть формат
 * параметром. Див. docs/superpowers/specs/2026-11-11-six-max-design.md.
 *
 * 9-max збирається з констант ranges.ts без жодних змін — це референс,
 * звірений фікстурами. Виняток — захист від 3-бету: він свідомо відійшов
 * від референсу (2026-11-11-vs3bet-defense-design.md). 6-max не має
 * референсу: діапазони задає спека.
 */

import { minus } from './cards'
import {
  BUCKET,
  ISO,
  ISO_ORDER,
  NOTES,
  OPEN_ORDER,
  RFI,
  S,
  TIGHTER2,
  VS_3BET,
  VS_4BET,
  VS_RAISE,
  WEAK_O,
  cell3,
  disjoint,
  type IsoPosition,
  type RaiserBucket,
  type Vs3betCell,
  type Vs3betDef,
  type Vs3betSide,
  type Vs4betDef,
  type VsRaiseDef,
} from './ranges'
import { ACTION_ORDER, type Hand, type Position, type TableId } from './types'

export interface TableConfig {
  readonly id: TableId
  readonly label: string
  /** Місця в порядку дій префлопу. Останні два — завжди SB і BB. */
  readonly seats: readonly Position[]
  /** Хто може відкривати пот (усі, крім блайндів). */
  readonly openOrder: readonly Position[]
  /** Звідки буває ізоляція лімперів (усі, крім першого місця і BB). */
  readonly isoOrder: readonly IsoPosition[]
  readonly rfi: Readonly<Record<string, ReadonlySet<Hand>>>
  readonly iso: Readonly<Record<string, ReadonlySet<Hand>>>
  /** Проти двох лімперів — діапазон якої позиції брати. */
  readonly tighter2: Readonly<Partial<Record<Position, Position>>>
  readonly bucket: (p: Position) => RaiserBucket
  readonly vsRaise: Readonly<Record<RaiserBucket, VsRaiseDef>>
  readonly vs3bet: Vs3betDef
  readonly vs4bet: Vs4betDef
  readonly notes: Readonly<Partial<Record<Position, string>>>
  /** Ворота: скільки позицій мають набрати норму («усі, крім однієї»). */
  readonly posCount: number
}

const NINE: TableConfig = {
  id: '9max',
  label: '9-max',
  seats: ACTION_ORDER,
  openOrder: OPEN_ORDER,
  isoOrder: ISO_ORDER,
  rfi: RFI,
  iso: ISO,
  tighter2: TIGHTER2,
  bucket: BUCKET,
  vsRaise: VS_RAISE,
  vs3bet: VS_3BET,
  vs4bet: VS_4BET,
  notes: NOTES,
  posCount: 8,
}

// ── 6-max ────────────────────────────────────────────────────────────────────

const SIX_SEATS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const satisfies readonly Position[]
const SIX_OPEN = ['UTG', 'HJ', 'CO', 'BTN'] as const satisfies readonly Position[]
const SIX_ISO = ['HJ', 'CO', 'BTN', 'SB'] as const satisfies readonly IsoPosition[]

/** Що ДОДАЄТЬСЯ до діапазону на кожній наступній позиції (кумулятивно, як у 9-max). */
const SIX_RFI_ADD: Readonly<Record<(typeof SIX_OPEN)[number], readonly string[]>> = {
  UTG: ['55+', 'A2s+', 'K9s+', 'Q9s+', 'J9s+', 'T9s', '98s', 'AJo+', 'KQo'],
  HJ: ['44', '33', 'K8s', 'T8s', '87s', 'ATo', 'KJo'],
  CO: ['22', 'K5s-K7s', 'Q8s', 'J8s', '97s', '76s', '65s', 'A8o-A9o', 'KTo', 'QJo', 'QTo', 'JTo'],
  BTN: [
    'K2s-K4s',
    'Q2s-Q7s',
    'J6s-J7s',
    'T6s-T7s',
    '96s',
    '86s',
    '75s',
    '64s',
    '54s',
    'A2o-A7o',
    'K8o-K9o',
    'Q9o',
    'J9o',
    'T9o',
    '98o',
  ],
}

const SIX_RFI: Readonly<Record<string, ReadonlySet<Hand>>> = (() => {
  const table: Record<string, Set<Hand>> = {}
  let acc: string[] = []
  for (const p of SIX_OPEN) {
    acc = acc.concat(SIX_RFI_ADD[p])
    table[p] = S(...acc)
  }
  const btn = table['BTN']
  if (btn === undefined) throw new Error('6-max RFI["BTN"] not built')
  // SB = BTN мінус найгірше, що без позиції грає погано. Рейз або фолд, як у 9-max.
  table['SB'] = minus(btn, S('A2o-A3o', 'K8o', '98o', '64s', 'Q2s-Q3s'))
  return table
})()

const SIX_ISO_RANGES: Readonly<Record<string, ReadonlySet<Hand>>> = (() => {
  const table: Record<string, Set<Hand>> = {}
  for (const p of SIX_ISO) {
    const base = SIX_RFI[p]
    if (base === undefined) throw new Error(`6-max RFI["${p}"] missing`)
    table[p] = minus(base, WEAK_O)
  }
  return table
})()

const SIX_BUCKET = (p: Position): RaiserBucket =>
  p === 'UTG' ? 'EARLY' : p === 'HJ' || p === 'CO' ? 'MID' : 'LATE'

const SIX_VS_RAISE_RAW: Readonly<Record<RaiserBucket, VsRaiseDef>> = {
  EARLY: {
    label: 'UTG',
    raise: S('QQ+', 'AKs', 'AKo', 'AQs'),
    call: {
      POS: S('22-JJ', 'ATs-AJs', 'KJs-KQs', 'QJs', 'JTs', 'T9s', 'AQo'),
      SB: S('99-JJ', 'AJs', 'KQs'),
      BB: S('22-JJ', 'A2s-AJs', 'KTs+', 'QTs+', 'JTs', 'T9s', '98s', '87s', '76s', 'AJo-AQo', 'KQo'),
    },
    note: 'Перший відкривач у 6-max усе ще тримає найвужчий діапазон столу. 3-бет — переважно валью; колуй у позиції руками, що грають постфлоп.',
  },
  MID: {
    label: 'HJ або CO',
    raise: S('JJ+', 'AQs+', 'AQo+', 'A4s-A5s'),
    call: {
      POS: S('22-TT', 'ATs-AJs', 'KTs+', 'QTs+', 'JTs', 'T9s', '98s', 'AJo', 'KQo'),
      SB: S('88-TT', 'AJs', 'KQs'),
      BB: S(
        '22-TT',
        'A2s-AJs',
        'K8s+',
        'Q9s+',
        'J9s+',
        'T8s+',
        '97s+',
        '86s+',
        '76s',
        '65s',
        'A9o-AJo',
        'KTo+',
        'QTo+',
        'JTo',
      ),
    },
    note: "Опенер ширший, ніж на 9-max, — з'являються 3-бет-блефи слабкими тузами в масті. Решту 3-бетів роби руками, що б'ють його колл.",
  },
  LATE: {
    label: 'BTN або SB (стіл-рейз)',
    raise: S('99+', 'ATs+', 'KJs+', 'AJo+', 'A2s-A5s'),
    call: {
      POS: S('22-88', 'A6s-A9s', 'KTs', 'QTs+', 'JTs', 'T9s', '98s', 'ATo', 'KQo', 'KJo'),
      SB: S('66-88', 'A9s'),
      BB: S(
        '22-88',
        'A2s-A9s',
        'K5s+',
        'Q7s+',
        'J7s+',
        'T7s+',
        '96s+',
        '85s+',
        '74s+',
        '64s+',
        '53s+',
        'A2o-ATo',
        'K9o+',
        'Q9o+',
        'J9o+',
        'T9o',
        '98o',
      ),
    },
    note: 'Стіл-рейз з баттона відкриває майже половину рук. З BB захищайся широко — ти закриваєш торги; з SB майже все — 3-бет або фолд.',
  },
}

const SIX: TableConfig = {
  id: '6max',
  label: '6-max',
  seats: SIX_SEATS,
  openOrder: SIX_OPEN,
  isoOrder: SIX_ISO,
  rfi: SIX_RFI,
  iso: SIX_ISO_RANGES,
  // Два лімпери — на дві позиції тугіше; тугіше за UTG нікуди.
  tighter2: { HJ: 'UTG', CO: 'UTG', BTN: 'HJ', SB: 'CO' },
  bucket: SIX_BUCKET,
  vsRaise: {
    EARLY: disjoint(SIX_VS_RAISE_RAW.EARLY),
    MID: disjoint(SIX_VS_RAISE_RAW.MID),
    LATE: disjoint(SIX_VS_RAISE_RAW.LATE),
  },
  // 3-бетор у 6-max ширший, тож захист ширший, ніж у 9-max, у кожній клітинці.
  vs3bet: {
    EARLY: {
      OOP: cell3(
        S('QQ+', 'AKs', 'AKo', 'A5s'),
        S('88-JJ', 'AJs-AQs', 'KQs', 'QJs', 'JTs', 'AQo'),
        'UTG проти 3-бету з позиції: без позиції колл лише з парами й одномасними бродвеями. A5s — 4-бет-блеф: блокує тузів, а коллом без позиції програє.',
      ),
      IP: cell3(
        S('QQ+', 'AKs', 'AKo', 'A5s'),
        S('77-JJ', 'ATs-AQs', 'KJs-KQs', 'QJs', 'JTs', 'T9s', '98s', 'AQo'),
        '3-бет із блайндів: позиція твоя, тож колл ширший — середні пари, одномасні бродвеї й конектори.',
      ),
    },
    MID: {
      OOP: cell3(
        S('QQ+', 'AKs', 'AKo', 'A4s-A5s'),
        S('88-JJ', 'ATs-AQs', 'KJs-KQs', 'QJs', 'JTs', 'T9s', 'AQo'),
        'Без позиції більшість рук — 4-бет або фолд. A5s і A4s — 4-бет-блеф, колл лише з руками, що добре реалізують еквіті.',
      ),
      IP: cell3(
        S('QQ+', 'AKs', 'AKo', 'A4s-A5s'),
        S('66-JJ', 'ATs-AQs', 'KTs+', 'QJs', 'JTs', 'T9s', '98s', '87s', 'AQo', 'AJo', 'KQo'),
        '3-бет із блайндів проти середнього опену: у позиції захищайся коллом широко — пари, одномасні бродвеї й конектори.',
      ),
    },
    LATE: {
      IP: cell3(
        S('QQ+', 'AKs', 'AKo', 'A4s-A5s'),
        S('55-JJ', 'A9s-AQs', 'KTs+', 'QTs+', 'J9s+', 'T9s', '98s', '87s', '76s', '65s', 'AQo', 'AJo', 'KQo'),
        'Баттон проти 3-бету з блайндів: ти відкриваєш майже половину рук і граєш у позиції, тож фолдити надто багато — найдорожча помилка цього споту.',
      ),
    },
  },
  // Підмножини 6-max 3-бету героя; ширший 3-бет означає більше фолдів на 4-бет.
  vs4bet: {
    EARLY: {
      IP: cell3(
        S('KK+', 'AKs', 'AKo'),
        S('QQ', 'AQs'),
        '4-бет з UTG — це QQ+ і AK. У позиції QQ і AQs — колл: 5-бетом ти виштовхнеш лише гірші руки, яких у нього майже немає.',
      ),
      OOP: cell3(
        S('QQ+', 'AKs', 'AKo'),
        S(),
        'Без позиції 4-бет-пот не коллять: або олл-ін, або фолд. QQ тут уже олл-ін.',
      ),
    },
    MID: {
      IP: cell3(
        S('KK+', 'AKs', 'AKo'),
        S('JJ-QQ', 'AQs'),
        'У позиції колл 4-бету з QQ, JJ і AQs. Блефові 3-бети (A5s, A4s) і AQo — фолд.',
      ),
      OOP: cell3(
        S('QQ+', 'AKs', 'AKo'),
        S(),
        'Без позиції 4-бет-пот не коллять: QQ+ і AK — олл-ін, решта 3-бетів — фолд.',
      ),
    },
    LATE: {
      OOP: cell3(
        S('JJ+', 'AKs', 'AKo'),
        S(),
        'Баттон 4-бетить широко, тож з блайнда олл-ін уже з JJ. Решта 3-бетів, зокрема всі блефи, — фолд.',
      ),
    },
  },
  notes: {
    UTG: "П'ять гравців за спиною. Діапазон приблизно як LJ на 9-max: пари, тузи в масті, сильні бродвеї.",
    HJ: 'Додаються дрібні пари, ATo і KJo. Попереду ще чотири гравці — не поспішай із сміттям.',
    CO: 'Відкриваєш, щоб забрати блайнди або грати в позиції. Бродвейні офсьюти вже в діапазоні.',
    BTN: 'Найприбутковіша позиція. Відкривай майже половину рук — ти завжди в позиції постфлоп.',
    SB: 'Ніколи не лімпи з SB. Або рейз, або фолд.',
    BB: 'Ти вже вклав блайнд і закриваєш торги — тому захищаєшся значно ширше.',
  },
  posCount: 5,
}

export const TABLES: Readonly<Record<TableId, TableConfig>> = { '9max': NINE, '6max': SIX }

/** Діапазон RFI для позиції; кидає, якщо позиція не відкриває пот. */
export function tableRfi(table: TableConfig, p: Position): ReadonlySet<Hand> {
  const r = table.rfi[p]
  if (r === undefined) throw new Error(`${table.label}: немає RFI-діапазону для ${p}`)
  return r
}

/** Діапазон ізоляції для позиції. */
export function tableIso(table: TableConfig, p: Position): ReadonlySet<Hand> {
  const r = table.iso[p]
  if (r === undefined) throw new Error(`${table.label}: немає ISO-діапазону для ${p}`)
  return r
}

/** Клітинка захисту від 3-бету; кидає, якщо такого споту не буває (LATE·OOP). */
export function tableVs3bet(table: TableConfig, heroPos: Position, side: Vs3betSide): Vs3betCell {
  const bucket = table.bucket(heroPos)
  const c = table.vs3bet[bucket][side]
  if (c === undefined) throw new Error(`${table.label}: немає захисту від 3-бету ${bucket}·${side}`)
  return c
}

/** Клітинка захисту від 4-бету; кидає, якщо такого споту не буває (LATE·IP). */
export function tableVs4bet(table: TableConfig, opener: Position, side: Vs3betSide): Vs3betCell {
  const bucket = table.bucket(opener)
  const c = table.vs4bet[bucket][side]
  if (c === undefined) throw new Error(`${table.label}: немає захисту від 4-бету ${bucket}·${side}`)
  return c
}

/** Місце за індексом у порядку дій столу. */
export function seatAt(table: TableConfig, i: number): Position {
  const p = table.seats[i]
  if (p === undefined) throw new RangeError(`${table.label}: seat index out of range: ${i}`)
  return p
}
