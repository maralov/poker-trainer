/**
 * Розбір помилок: класифікація рук, діагностика патернів, текстовий звіт.
 * Порт розділу «розбір префлопу» з poker-trainer.html.
 *
 * Функції повертають дані, а не HTML — рендер живе в компонентах.
 */

import { RI } from './cards'
import type { MistakeEntry, PreProgress } from './progress'
import { SCENARIOS } from './ranges'
import { actionName } from './spots'
import { ACTION_ORDER, type Hand, type Position, type Scenario } from './types'

export type HandCategory =
  | 'pairHigh'
  | 'pairMid'
  | 'pairLow'
  | 'aceSuitedHigh'
  | 'aceSuitedLow'
  | 'broadwaySuited'
  | 'suitedGap'
  | 'suitedConn'
  | 'broadwayOffsuit'
  | 'aceOffsuit'
  | 'trash'

/** Напрям помилки: зіграв зайве (loose) чи скинув зайве (tight). */
export type Bias = 'loose' | 'tight'

export function handCat(h: Hand): HandCategory {
  const pair = h.length === 2
  const s = h[2] === 's'
  const a = RI(h[0] ?? '')
  const b = RI(h[1] ?? '')
  if (pair) return a <= RI('T') ? 'pairHigh' : a <= RI('6') ? 'pairMid' : 'pairLow'
  if (h[0] === 'A') {
    return s
      ? b <= RI('T')
        ? 'aceSuitedHigh'
        : 'aceSuitedLow'
      : b <= RI('T')
        ? 'broadwayOffsuit'
        : 'aceOffsuit'
  }
  if (s) {
    if (a <= RI('T') && b <= RI('T')) return 'broadwaySuited'
    return b - a <= 2 ? 'suitedConn' : 'suitedGap'
  }
  return a <= RI('T') && b <= RI('T') ? 'broadwayOffsuit' : 'trash'
}

export const CAT_LABEL: Readonly<Record<HandCategory, string>> = {
  pairHigh: 'Старші пари (TT+)',
  pairMid: 'Середні пари (66–99)',
  pairLow: 'Дрібні пари (22–55)',
  aceSuitedHigh: 'Старші тузи в масті (ATs+)',
  aceSuitedLow: 'Слабкі тузи в масті (A2s–A9s)',
  broadwaySuited: 'Бродвеї в масті',
  suitedGap: 'Гепери в масті (K5s, Q8s…)',
  suitedConn: 'Конектори в масті (54s–98s)',
  broadwayOffsuit: 'Офсьютні бродвеї (AJo, KQo, KJo…)',
  aceOffsuit: 'Слабкі офсьютні тузи (A2o–A9o)',
  trash: 'Слабкі офсьютні руки',
}

export const FIX: Readonly<Record<HandCategory, Readonly<Record<Bias, string>>>> = {
  pairLow: {
    loose:
      'Дрібні пари — не автоматичний опен. З ранньої позиції ти сет-майниш проти восьми опонентів і майже завжди поза позицією: імплайди не покривають те, скільки разів ти промахуєшся повз сет. 22–44 відкриваються з LJ і пізніше.',
    tight:
      'З CO, BTN і SB дрібні пари відкриваються завжди. Там цінність не в сеті, а в тому, як часто ти просто забираєш блайнди.',
  },
  pairMid: {
    loose: 'Перевір, чи не плутаєш 55 з 66 — межа тут проходить рівно між ними.',
    tight:
      '66–99 — твердий опен з будь-якої позиції, включно з UTG. Якщо ти їх скидаєш, ранній діапазон стає надто вузьким.',
  },
  aceSuitedLow: {
    loose:
      'A2s–A6s — руки для пізньої позиції. З UTG–MP вони доміновані всім, чим тебе колують: флеш приходить нечасто, а топ-пара зі слабким кікером коштує грошей.',
    tight:
      'З LJ і далі слабкі тузи в масті відкриваються нормально: є і флеш-потенціал, і блокер на туза.',
  },
  aceSuitedHigh: {
    loose: 'ATs+ у відкритті помилкою не буває — перевір позицію.',
    tight:
      'ATs, AJs, AQs, AKs відкриваються звідусіль без винятків. Якщо ти їх скидаєш — ти надто затиснутий.',
  },
  broadwayOffsuit: {
    loose:
      'Головна пастка 9-max. KJo, QJo, KQo виглядають красиво, але грають погано: ти або виграєш крихітний пот, або програєш великий тому, хто тебе домінує. KJo та QJo — не раніше HJ, ATo — не раніше LJ.',
    tight:
      'AJo та KQo з середньої позиції — стандартні опени. Не плутай дисципліну з пасивністю.',
  },
  aceOffsuit: {
    loose:
      'A2o–A9o — це BTN, і майже нічого більше. З інших позицій ти систематично домінований: коли туз приходить на флоп, у тебе гірший кікер — і саме тоді пот стає великим.',
    tight:
      'З BTN весь діапазон A2o–A8o відкривається. Це не про силу руки, а про частоту атак на два блайнди.',
  },
  suitedConn: {
    loose:
      'Конектори в масті живуть з позиції та імплайдів. З ранніх позицій ти не отримуєш ні того, ні іншого.',
    tight: '65s–98s з CO і BTN — стандартні опени: ти діятимеш останнім на всіх вулицях.',
  },
  suitedGap: {
    loose:
      '«В масті» ще не означає «можна». K5s, Q8s, J8s з ранніх позицій доміновані старшою картою, а флеш ти збереш у 6% випадків.',
    tight: 'З CO і BTN ці руки входять у діапазон: вони достатньо часто забирають пот одразу.',
  },
  broadwaySuited: {
    loose: 'Ці руки й так у діапазоні майже звідусіль — перевір позицію.',
    tight: 'KTs, QTs, JTs — опен з будь-якої позиції. Флеш, стріт і топ-пара одночасно.',
  },
  trash: {
    loose:
      'Ці руки просто не відкриваються. Коли вони проскакують — це нетерплячка після довгої серії фолдів, а не оцінка ситуації.',
    tight: '',
  },
  pairHigh: { loose: '', tight: 'Старші пари відкриваються завжди і звідусіль.' },
}

export type PositionGroup = 'early' | 'mid' | 'late'

export const GRP: Readonly<Record<Position, PositionGroup>> = {
  UTG: 'early',
  'UTG+1': 'early',
  MP: 'early',
  LJ: 'mid',
  HJ: 'mid',
  CO: 'mid',
  BTN: 'late',
  SB: 'late',
  BB: 'late',
}

export const GRP_LABEL: Readonly<Record<PositionGroup, string>> = {
  early: 'Ранні (UTG–MP)',
  mid: 'Середні (LJ–CO)',
  late: 'Пізні (BTN–SB)',
}

export const GRP_FIX: Readonly<Record<PositionGroup, Readonly<Record<Bias, string>>>> = {
  early: {
    loose:
      'Твої найдорожчі помилки — у ранніх позиціях. Кожна зайва рука тут грається поза позицією проти шести-восьми опонентів, і саме ці роздачі закінчуються великим потом з другою найкращою рукою. Правило: сумніваєшся на UTG — фолд.',
    tight:
      'У ранніх позиціях ти надто затиснутий. UTG у 9% — це вже дуже туго; ще вужче означає, що ти просто не встигаєш отримувати руки і починаєш нудьгувати.',
  },
  mid: {
    loose:
      'У середніх позиціях ти відкриваєш забагато. За тобою ще CO, BTN і два блайнди — чотири шанси, що тебе переставлять або заколують у позиції.',
    tight:
      'Середні позиції — місце, де діапазон має відчутно розширюватись. Якщо LJ і HJ грають як UTG, ти втрачаєш найбільш недооцінені гроші за столом.',
  },
  late: {
    loose:
      'Навіть на BTN є межа: 42% — це не «будь-що». Найчастіше зайвим виявляється офсьютне сміття на кшталт J8o чи Q6o.',
    tight:
      'BTN і SB — твої найприбутковіші позиції, а ти в них фолдиш. Втрата та сама, що й зайві руки з UTG, тільки менш помітна.',
  },
}

/** Помилка типу loose — коли правильною дією був фолд, а ти зіграв. */
const biasOf = (e: MistakeEntry): Bias => (e.co === 'fold' ? 'loose' : 'tight')

export interface Finding {
  readonly c: HandCategory
  readonly b: Bias
  readonly n: number
  readonly text: string
}

export interface WorstGroup {
  readonly g: PositionGroup
  readonly bias: Bias
  readonly n: number
  readonly text: string
}

export interface TopMistake {
  readonly hand: Hand
  readonly pos: Position
  readonly correct: string
  readonly isFold: boolean
  readonly n: number
}

export interface Review {
  readonly played: number
  readonly acc: number
  readonly mistakes: number
  readonly loose: number
  readonly tight: number
  readonly biasLine: string
  readonly findings: readonly Finding[]
  readonly worstGroup: WorstGroup | null
  readonly topMistakes: readonly TopMistake[]
  readonly byPosition: readonly { pos: Position; acc: number | null; t: number }[]
}

const BIAS_LOOSE =
  'Твій основний перекіс — <strong>надто широко</strong>. Ти відкриваєш руки, які треба скидати; це найдорожчий тип помилки, бо кожна така рука ще й грається далі.'
const BIAS_TIGHT =
  "Твій основний перекіс — <strong>надто туго</strong>. Ти скидаєш руки, які мали б відкриватись; втрата тихіша, але на дистанції вона з'їдає вінрейт з пізніх позицій."
const BIAS_MIXED =
  'Перекіс у обидва боки приблизно однаковий — діапазони ще не завчені як цілісні картинки, рішення приймаються на око.'

export function buildReview(progress: PreProgress, scen: Scenario): Review {
  const log = progress.log.filter((e) => e.s === scen)
  const played = progress.byScen[scen]?.t ?? 0
  const loose = log.filter((e) => e.co === 'fold').length
  const tight = log.length - loose
  const acc = played ? Math.round(((played - log.length) / played) * 100) : 0

  // Патерни: категорія руки × напрям помилки, від двох випадків і з готовим текстом.
  const agg = new Map<string, number>()
  for (const e of log) {
    const k = `${handCat(e.h)}|${biasOf(e)}`
    agg.set(k, (agg.get(k) ?? 0) + 1)
  }
  const findings: Finding[] = [...agg]
    .map(([k, n]) => {
      const [c, b] = k.split('|') as [HandCategory, Bias]
      return { c, b, n, text: FIX[c][b] }
    })
    .filter((f) => f.n >= 2 && f.text)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)

  // Найслабша група позицій — та, де найбільше помилок.
  const grp = new Map<PositionGroup, { loose: number; tight: number }>()
  for (const e of log) {
    const g = GRP[e.p]
    const d = grp.get(g) ?? { loose: 0, tight: 0 }
    d[biasOf(e)]++
    grp.set(g, d)
  }
  const worstEntry = [...grp].sort((a, b) => b[1].loose + b[1].tight - (a[1].loose + a[1].tight))[0]
  const worstGroup: WorstGroup | null = worstEntry
    ? (() => {
        const [g, d] = worstEntry
        const bias: Bias = d.loose >= d.tight ? 'loose' : 'tight'
        return { g, bias, n: d.loose + d.tight, text: GRP_FIX[g][bias] }
      })()
    : null

  const byHand = new Map<string, number>()
  for (const e of log) {
    const k = `${e.p}|${e.h}|${e.co}`
    byHand.set(k, (byHand.get(k) ?? 0) + 1)
  }
  const topMistakes: TopMistake[] = [...byHand]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, n]) => {
      const [pos, hand, co] = k.split('|') as [Position, Hand, MistakeEntry['co']]
      return { hand, pos, correct: actionName(co, scen), isFold: co === 'fold', n }
    })

  const scenPos = progress.byScenPos[scen] ?? {}
  const byPosition = ACTION_ORDER.map((pos) => {
    const d = scenPos[pos]
    return { pos, acc: d && d.t ? Math.round((d.c / d.t) * 100) : null, t: d?.t ?? 0 }
  })

  const biasLine =
    loose > tight * 1.6 ? BIAS_LOOSE : tight > loose * 1.6 ? BIAS_TIGHT : BIAS_MIXED

  return {
    played,
    acc,
    mistakes: log.length,
    loose,
    tight,
    biasLine,
    findings,
    worstGroup,
    topMistakes,
    byPosition,
  }
}

/** Текстовий звіт — той самий формат, що в HTML-версії, щоб можна було копіювати на розбір. */
export function buildReport(progress: PreProgress, scen: Scenario): string {
  const log = progress.log.filter((e) => e.s === scen)
  const played = progress.byScen[scen]?.t ?? 0
  const acc = played ? Math.round(((played - log.length) / played) * 100) : 0

  const lines: string[] = [
    `ЗВІТ · ПРЕФЛОП · сценарій: ${SCENARIOS[scen].label}`,
    `Зіграно: ${played} · точність: ${acc}% · помилок: ${log.length}`,
    `Зайвих відкриттів: ${log.filter((e) => e.co === 'fold').length} · зайвих фолдів: ${
      log.filter((e) => e.co !== 'fold').length
    }`,
    '',
    'ТОЧНІСТЬ ЗА ПОЗИЦІЯМИ (у цьому сценарії):',
  ]

  const scenPos = progress.byScenPos[scen] ?? {}
  let anyPos = false
  for (const p of ACTION_ORDER) {
    const d = scenPos[p]
    if (d && d.t) {
      anyPos = true
      lines.push(`  ${p}: ${Math.round((d.c / d.t) * 100)}% (${d.t})`)
    }
  }
  if (!anyPos) lines.push('  (немає даних)')

  lines.push('', 'ПОМИЛКИ (рука / позиція / правильна дія / разів):')
  const byHand = new Map<string, number>()
  for (const e of log) {
    const k = `${e.p}|${e.h}|${e.co}`
    byHand.set(k, (byHand.get(k) ?? 0) + 1)
  }
  for (const [k, n] of [...byHand].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    const [p, h, co] = k.split('|') as [Position, Hand, MistakeEntry['co']]
    lines.push(`  ${h} / ${p} / ${actionName(co, scen)} / ${n}x`)
  }

  return lines.join('\n')
}
