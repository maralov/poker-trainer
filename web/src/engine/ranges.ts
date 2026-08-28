/**
 * Діапазони. Порт з poker-trainer.html, розділ «ДІАПАЗОНИ», 1:1.
 *
 * Нічого тут не «покращувати»: якщо здається, що діапазон неправильний —
 * це окреме продуктове рішення, а не частина міграції.
 */

import { ALL_HANDS, RI, minus, rankAt } from './cards'
import { ACTION_ORDER, type Hand, type Position, type Scenario } from './types'

const RX = '[AKQJT98765432]'

/**
 * Розгортає токен діапазону в список рук.
 *
 * Підтримувані формати:
 *   `66+`      — пари від 66 і вище
 *   `22-JJ`    — діапазон пар (порядок кінців не важливий)
 *   `A4s-A5s`  — діапазон за молодшою картою; старша береться з ПЕРШОЇ руки
 *   `ATs+`     — від ATs до AKs
 *   `T9s`      — одна рука (fallback)
 */
export function parseToken(t: string): Hand[] {
  const out: Hand[] = []

  // 66+ : усі пари від заданої і вище
  const mPairPlus = t.match(new RegExp(`^(${RX})\\1\\+$`))
  if (mPairPlus?.[1] !== undefined) {
    for (let i = RI(mPairPlus[1]); i >= 0; i--) out.push(`${rankAt(i)}${rankAt(i)}`)
    return out
  }

  // 22-JJ : діапазон пар
  const mPairRange = t.match(new RegExp(`^(${RX})\\1-(${RX})\\2$`))
  if (mPairRange?.[1] !== undefined && mPairRange[2] !== undefined) {
    let a = RI(mPairRange[1])
    let b = RI(mPairRange[2])
    if (a > b) [a, b] = [b, a]
    for (let i = a; i <= b; i++) out.push(`${rankAt(i)}${rankAt(i)}`)
    return out
  }

  // A4s-A5s : діапазон за молодшою картою. Старша — з першої руки (m[1]),
  // друга старша (m[4]) свідомо ігнорується, як і в референсі.
  const mKickerRange = t.match(new RegExp(`^(${RX})(${RX})([so])-(${RX})(${RX})\\3$`))
  if (
    mKickerRange?.[1] !== undefined &&
    mKickerRange[2] !== undefined &&
    mKickerRange[3] !== undefined &&
    mKickerRange[5] !== undefined
  ) {
    const hi = RI(mKickerRange[1])
    const suffix = mKickerRange[3]
    let a = RI(mKickerRange[2])
    let b = RI(mKickerRange[5])
    if (a > b) [a, b] = [b, a]
    for (let i = a; i <= b; i++) out.push(`${rankAt(hi)}${rankAt(i)}${suffix}`)
    return out
  }

  // ATs+ : від заданої руки до AKs
  const mKickerPlus = t.match(new RegExp(`^(${RX})(${RX})([so])\\+$`))
  if (
    mKickerPlus?.[1] !== undefined &&
    mKickerPlus[2] !== undefined &&
    mKickerPlus[3] !== undefined
  ) {
    const hi = RI(mKickerPlus[1])
    const suffix = mKickerPlus[3]
    for (let i = RI(mKickerPlus[2]); i > hi; i--) out.push(`${rankAt(hi)}${rankAt(i)}${suffix}`)
    return out
  }

  return [t]
}

/** Набір рук із токенів. */
export const S = (...tokens: string[]): Set<Hand> => new Set(tokens.flatMap(parseToken))

/** Що ДОДАЄТЬСЯ до діапазону на кожній наступній позиції (діапазони кумулятивні). */
const RFI_ADD: Readonly<Record<string, readonly string[]>> = {
  UTG: ['66+', 'ATs+', 'KTs+', 'QTs+', 'JTs', 'T9s', 'AQo+'],
  'UTG+1': ['55', 'A9s', '98s', 'AJo'],
  MP: ['44', 'A8s', 'K9s', 'J9s', 'KQo'],
  LJ: ['33', 'A7s', 'A4s-A5s', 'Q9s', 'T8s', 'ATo'],
  HJ: ['22', 'A6s', 'A2s-A3s', 'K8s', '87s', 'KJo', 'QJo'],
  CO: ['K5s-K7s', 'Q8s', 'J8s', 'T7s', '97s', '76s', '65s', 'A9o', 'KTo', 'QTo', 'JTo'],
  BTN: [
    'K2s-K4s',
    'Q5s-Q7s',
    'J6s-J7s',
    'T6s',
    '96s',
    '86s',
    '75s',
    '64s',
    '54s',
    'A2o-A8o',
    'K8o-K9o',
    'Q9o',
    'J9o',
    'T9o',
    '98o',
  ],
}

/** Позиції, які можуть відкривати пот. BB відсутній — там не буває RFI. */
export const OPEN_ORDER = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN'] as const

/** Діапазони відкриття. SB = BTN мінус найгірші офсьюти (грає без позиції). */
export const RFI: Readonly<Record<string, ReadonlySet<Hand>>> = (() => {
  const table: Record<string, Set<Hand>> = {}
  let acc: string[] = []
  for (const p of OPEN_ORDER) {
    acc = acc.concat(RFI_ADD[p] ?? [])
    table[p] = S(...acc)
  }
  const btn = table['BTN']
  if (btn === undefined) throw new Error('RFI["BTN"] not built')
  table['SB'] = minus(btn, S('A2o-A4o', 'K8o', '98o', '64s', '86s', 'T6s'))
  return table
})()

/** Слабкі офсьюти — у мультипоті проти лімперів вони грають погано навіть у позиції. */
export const WEAK_O = S(
  'A2o-A9o',
  'K8o-K9o',
  'KTo',
  'Q9o',
  'QTo',
  'J9o',
  'JTo',
  'T9o',
  '98o',
  'ATo',
)

/**
 * Позиції, з яких буває ізоляція лімперів. UTG відсутній — перед ним нікого
 * немає; BB відсутній, бо проти самих лімперів там немає фолду: ти закриваєш
 * торги і бачиш флоп безкоштовно, тож вибір «ізо-рейз або фолд» не існує.
 */
export const ISO_ORDER = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'] as const
export type IsoPosition = (typeof ISO_ORDER)[number]
export const isIsoPosition = (p: Position): p is IsoPosition => p !== 'BB'

/** Діапазони ізоляції лімперів = RFI мінус слабкі офсьюти. */
export const ISO: Readonly<Record<string, ReadonlySet<Hand>>> = (() => {
  const table: Record<string, Set<Hand>> = {}
  for (const p of ISO_ORDER) {
    const base = RFI[p]
    if (base === undefined) throw new Error(`RFI["${p}"] missing`)
    table[p] = minus(base, WEAK_O)
  }
  return table
})()

/** Проти двох лімперів звужуємось на дві позиції. */
export const TIGHTER2: Readonly<Record<IsoPosition, Position>> = {
  UTG: 'UTG',
  'UTG+1': 'UTG',
  MP: 'UTG',
  LJ: 'UTG+1',
  HJ: 'MP',
  CO: 'LJ',
  BTN: 'HJ',
  SB: 'CO',
}

export type RaiserBucket = 'EARLY' | 'MID' | 'LATE'
/** Контекст героя щодо рейзера: у позиції, на малому чи великому блайнді. */
export type HeroContext = 'POS' | 'SB' | 'BB'

interface VsRaiseDef {
  readonly label: string
  readonly raise: ReadonlySet<Hand>
  readonly call: Readonly<Record<HeroContext, ReadonlySet<Hand>>>
  readonly note: string
}

const VS_RAISE_RAW: Readonly<Record<RaiserBucket, VsRaiseDef>> = {
  EARLY: {
    label: 'ранньої позиції (UTG–MP)',
    raise: S('QQ+', 'AKs', 'AKo'),
    call: {
      POS: S('22-JJ', 'AQs', 'AJs', 'KQs', 'QJs', 'JTs'),
      SB: S('88-JJ', 'AQs', 'AJs', 'KQs'),
      BB: S('22-JJ', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs', 'AQo'),
    },
    note: 'Рейз з UTG–MP на 9-max — це майже завжди справжня рука. Не вигадуй тут блефових 3-бетів: колуй у позиції з потенціалом, решту скидай.',
  },
  MID: {
    label: 'середньої позиції (LJ–CO)',
    raise: S('TT+', 'AJs+', 'AQo+'),
    call: {
      POS: S('22-99', 'ATs', 'KJs', 'KQs', 'QJs', 'JTs', 'T9s', 'AJo'),
      SB: S('77-99', 'ATs', 'KQs', 'AJo'),
      BB: S(
        '22-99',
        'A2s-ATs',
        'KTs+',
        'Q9s+',
        'J9s+',
        'T9s',
        '98s',
        '87s',
        'ATo',
        'AJo',
        'KQo',
        'KJo',
        'QJo',
        'JTo',
      ),
    },
    note: "Діапазон опенера вже ширший, тому 3-бетиш валью-руками, які б'ють його калл-діапазон. AJs і TT тут — рейз, а не колл.",
  },
  LATE: {
    label: 'BTN або SB (стіл-рейз)',
    raise: S('99+', 'AJs+', 'KQs', 'AQo+', 'A4s-A5s'),
    call: {
      POS: S('22-88', 'A7s-ATs', 'KJs', 'QJs', 'JTs', 'T9s', 'AJo', 'KQo'),
      SB: S('66-88', 'ATs'),
      BB: S(
        '22-88',
        'A2s-ATs',
        'K7s+',
        'Q8s+',
        'J8s+',
        'T8s+',
        '97s+',
        '86s+',
        '75s+',
        '65s',
        '54s',
        'A8o-AJo',
        'KTo+',
        'QTo+',
        'JTo',
        'T9o',
      ),
    },
    note: 'Найширший діапазон опенера за столом. З BB захищайся широко — ти вже вклав блайнд і закриваєш торги. З SB навпаки: 3-бет або фолд.',
  },
}

/**
 * Колл описаний широкими токенами (`A2s-ATs`, `K7s+`), які захоплюють руки з
 * рейзу. Оцінка перевіряє рейз першим, тож така рука мовчки ставала рейзом,
 * а таблиця показувала її як колл — і відсотки в шапці не сходились із сумою.
 * Віднімаємо рейз від коллу один раз тут, щоб перетин не міг зʼявитися знову.
 */
const disjoint = (def: VsRaiseDef): VsRaiseDef => ({
  ...def,
  call: {
    POS: minus(def.call.POS, def.raise),
    SB: minus(def.call.SB, def.raise),
    BB: minus(def.call.BB, def.raise),
  },
})

export const VS_RAISE: Readonly<Record<RaiserBucket, VsRaiseDef>> = {
  EARLY: disjoint(VS_RAISE_RAW.EARLY),
  MID: disjoint(VS_RAISE_RAW.MID),
  LATE: disjoint(VS_RAISE_RAW.LATE),
}

export const VS_3BET = {
  raise: S('KK+', 'AKs'),
  call: S('TT-QQ', 'AKo', 'AQs'),
  note: 'На 5/10 3-бет майже завжди означає реальну руку. Це той спот, де дисциплінований фолд коштує дешевше за будь-яку креативність.',
} as const

export const NOTES: Readonly<Record<Position, string>> = {
  UTG: "Дев'ять гравців за спиною. Відкривай лише те, що не соромно грати в мультипоті.",
  'UTG+1': 'Майже те саме, що UTG. Спокуса «трохи розширитись» тут коштує найдорожче.',
  MP: "З'являється місце для маневру, але попереду ще п'ять гравців.",
  LJ: 'Перша позиція, де можна відкривати ATo і слабкі тузи. Слабкі — лише в масті.',
  HJ: 'Три позиції до баттона. Додаються бродвейні офсьюти і дрібні конектори в масті.',
  CO: 'Відкриваєш, щоб забрати пот одразу або грати в позиції проти блайндів.',
  BTN: 'Найприбутковіша позиція за столом. Вінрейт тут будується на частоті відкриття.',
  SB: 'Ніколи не лімпи з SB. Або рейз, або фолд.',
  BB: 'Ти вже вклав блайнд і закриваєш торги — тому захищаєшся значно ширше.',
}

export const BUCKET = (p: Position): RaiserBucket =>
  (['UTG', 'UTG+1', 'MP'] as const).includes(p as 'UTG')
    ? 'EARLY'
    : (['LJ', 'HJ', 'CO'] as const).includes(p as 'LJ')
      ? 'MID'
      : 'LATE'

export const HERO_CTX = (p: Position): HeroContext => (p === 'BB' ? 'BB' : p === 'SB' ? 'SB' : 'POS')

export const SCENARIOS: Readonly<Record<Scenario, { label: string; short: string }>> = {
  rfi: { label: 'Відкриття', short: 'RFI' },
  iso: { label: 'Проти лімперів', short: 'ІЗО' },
  vsraise: { label: 'Проти рейзу', short: '3-БЕТ' },
  vs3bet: { label: 'Проти 3-бету', short: 'vs3Б' },
}

/**
 * Руки, які «спокушають» зіграти. Підмішуються до діапазонів при роздачі,
 * щоб тренажер частіше показував спірні споти, а не очевидне сміття.
 */
export const TEMPTING = S(
  '22-AA',
  'A2s-AKs',
  'KTs+',
  'QTs+',
  'JTs',
  'T9s',
  '98s',
  'ATo-AKo',
  'KJo-KQo',
  'QJo',
  'JTo',
  'A9o',
  'KTo',
)

/** Діапазон RFI для позиції; кидає, якщо позиція не відкриває пот (BB). */
export function rfiRange(p: Position): ReadonlySet<Hand> {
  const r = RFI[p]
  if (r === undefined) throw new Error(`немає RFI-діапазону для позиції ${p}`)
  return r
}

/** Діапазон ізоляції для позиції. */
export function isoRange(p: Position): ReadonlySet<Hand> {
  const r = ISO[p]
  if (r === undefined) throw new Error(`немає ISO-діапазону для позиції ${p}`)
  return r
}

/** Позиція за індексом у порядку дій. */
export function positionAt(i: number): Position {
  const p = ACTION_ORDER[i]
  if (p === undefined) throw new RangeError(`position index out of range: ${i}`)
  return p
}

/** Чи є рядок валідною канонічною рукою ('AKs', 'AA', 'T9o'). */
const ALL_HANDS_SET: ReadonlySet<string> = new Set(ALL_HANDS)
export const isHand = (h: string): h is Hand => ALL_HANDS_SET.has(h)
