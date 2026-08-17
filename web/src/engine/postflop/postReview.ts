/**
 * Розбір постфлопу: класифікація помилок у патерни, зрізи, текстовий звіт.
 *
 * Вісім патернів перенесені з `PF_FIX` у `poker-trainer.html` — там вони
 * описували лише флоп агресора. Шість нових (барель без еквіті, блеф рівера,
 * стек з однією парою, фолд сили, зайвий фолд, рейз проти сили) описують те,
 * чого в референсі не було: терн, рівер і захист.
 *
 * Як і в префлопі, функції повертають дані, а не HTML: рендер — у сторінці.
 */

import type { Tally } from '../progress'
import { POST_SLICE_MIN, type PostMistakeEntry, type PostProgress } from './postProgress'
import {
  FACING_LABEL,
  POST_ACT_LABEL,
  POST_CAT_LABEL,
  STREET_LABEL,
  TEX_LABEL,
  isBet,
  isStrong,
  type PostAction,
} from './types'

export type PostFixKey =
  | 'bluffMulti'
  | 'bluffWet'
  | 'bluffOOP'
  | 'thinBet'
  | 'weakBet'
  | 'missValue'
  | 'sizeSmall'
  | 'sizeBig'
  | 'barrelNoEquity'
  | 'riverBluff'
  | 'stackOnePair'
  | 'foldStrength'
  | 'foldTooTight'
  | 'callTooWide'
  | 'raiseIntoStrength'

export interface PostFix {
  readonly title: string
  readonly text: string
}

export const POST_FIX: Readonly<Record<PostFixKey, PostFix>> = {
  bluffMulti: {
    title: 'Блефи в мультипоті',
    text: 'Ти ставиш без руки, коли на флопі двоє й більше опонентів. Це найдорожча постфлоп-помилка на мікролімітах: проти кількох калл-діапазонів хтось майже завжди має пару або дро. Правило без винятків: у мультипоті ставиш тільки валью.',
  },
  bluffWet: {
    title: 'Блефи на мокрих дошках',
    text: 'Ти c-betиш порожні руки там, де текстура влучає в опонента частіше, ніж у тебе. Звʼязані дошки дають опоненту купу причин не фолдити, і твоя ставка платить за його дро.',
  },
  bluffOOP: {
    title: 'Блефи поза позицією',
    text: 'Проблема не в самій ставці, а в тому, що далі: на терні ти діятимеш першим і наосліп, і саме там ці роздачі стають великими програшами. Без позиції блеф доводиться продовжувати навмання.',
  },
  thinBet: {
    title: 'Ставки середніми руками на мокрій дошці',
    text: 'Ти ставиш там, де рука не витримує тиску: виганяєш усе гірше і платиш усьому кращому. Середня рука на мокрій дошці — це чек і дешевий шоудаун.',
  },
  weakBet: {
    title: 'Ставки слабкими парами',
    text: 'Ти ставиш третьою парою або андерпарою. Ці руки мають шоудаун-валью — але лише якщо доходиш до шоудауну дешево. Ставка перетворює їх на блеф без фолд-еквіті.',
  },
  missValue: {
    title: 'Пропущене валью',
    text: 'Ти чекаєш або просто колеш там, де треба забирати гроші. На лузовому полі це прямі втрати: опоненти платять значно частіше, ніж здається, і сильна рука мусить ставити або рейзити сама.',
  },
  sizeSmall: {
    title: 'Замалий сайз на мокрій дошці',
    text: 'Ти ставиш 33% там, де потрібно 66%. На дошці з дро дешева ставка дає опоненту правильну ціну догнати тебе — і він її бере.',
  },
  sizeBig: {
    title: 'Завеликий сайз на сухій дошці',
    text: 'Ти ставиш 66% там, де вистачає 33%. На сухій текстурі ти або забираєш той самий банк дешевше, або лякаєш гірші руки, які мали заплатити.',
  },
  barrelNoEquity: {
    title: 'Барель без еквіті',
    text: 'Друга куля порожньою рукою на терні не має адресата: колер флопу вже показав пару чи дро і майже не фолдить. Одна куля і зупинка — «one and done»; терн без еквіті чекається.',
  },
  riverBluff: {
    title: 'Блеф рівера',
    text: 'Рівер проти станцій не блефується — ніколи. Це головний урок етапу: без готової руки на рівері чек, навіть якщо весь план роздачі був про блеф. Пасивне поле не фолдить достатньо, щоб це окупилось.',
  },
  stackOnePair: {
    title: 'Стек з однією парою',
    text: 'Ти платиш агресію однією парою. Саме тут мікроліміти віддають стеки: топ-пара витримує один колл, а не серію. Друга куля пасивного гравця майже завжди сильніша за твою пару.',
  },
  foldStrength: {
    title: 'Фолд сили проти агресії',
    text: 'Ти скидаєш дві пари або сильне дро там, де ціна дозволяє продовжити. Агресор c-betить широко, і фолд справжньої руки проти нього — це відданий банк без бою.',
  },
  foldTooTight: {
    title: 'Зайві фолди проти дешевої ставки',
    text: 'Ти скидаєш руку, яка витримує одну дешеву ставку. Дисципліна — це не фолд усього: проти малої ставки рука з шоудаун-валью колле рівно один раз.',
  },
  callTooWide: {
    title: 'Колли без руки',
    text: 'Ти платиш «подивитись». Агресія пасивного поля майже завжди означає силу, і такий колл коштує рівно стільки, скільки вже в банку, — без плану на наступні вулиці.',
  },
  raiseIntoStrength: {
    title: 'Рейзи проти сили',
    text: 'Рейз проти агресії пасивного гравця виганяє лише гірші руки і роздуває банк проти кращих. Коли опонент уже показав силу, твої варіанти — колл або фолд.',
  },
}

/** Патерн однієї помилки. Порядок перевірок — від найдорожчого уроку до дрібних. */
export function classifyPostMistake(e: PostMistakeEntry): PostFixKey {
  if (e.facing === 'none') {
    if (isBet(e.ch) && e.co === 'check') {
      // Рівер попереду мультипоту свідомо: «рівер не блефуємо» — головне правило
      // етапу, і саме його треба назвати учневі першим.
      if (e.street === 'river') return 'riverBluff'
      if (e.street === 'turn' && (e.cat === 'AIR' || e.cat === 'WEAKDRAW')) return 'barrelNoEquity'
      if (e.n >= 2) return 'bluffMulti'
      if (e.cat === 'AIR' || e.cat === 'WEAKDRAW') return e.tex === 'WET' ? 'bluffWet' : 'bluffOOP'
      if (e.cat === 'MEDIUM') return 'thinBet'
      if (e.cat === 'WEAK') return 'weakBet'
      return 'bluffWet'
    }
    if (e.ch === 'check' && isBet(e.co)) return 'missValue'
    if (e.ch === 'b33' && e.co === 'b66') return 'sizeSmall'
    if (e.ch === 'b66' && e.co === 'b33') return 'sizeBig'
    return 'missValue'
  }

  if (e.ch === 'fold') {
    return isStrong(e.cat) || e.cat === 'DRAW' ? 'foldStrength' : 'foldTooTight'
  }
  if (e.co === 'fold') return e.cat === 'STRONG_PAIR' ? 'stackOnePair' : 'callTooWide'
  if (e.ch === 'raise' && e.co === 'call') return 'raiseIntoStrength'
  // Лишається колл там, де правильний рейз — те саме пропущене валью.
  return 'missValue'
}

export interface PostFinding extends PostFix {
  readonly key: PostFixKey
  readonly n: number
}

export interface PostTopMistake {
  readonly key: string
  readonly cat: string
  readonly street: string
  readonly facing: string
  readonly chosen: string
  readonly correct: string
  readonly n: number
  /** Знімок останнього такого споту — якщо журнал його має. */
  readonly board?: string
  readonly hand?: string
  readonly ep?: string
}

export interface PostSlice {
  readonly name: string
  readonly acc: number
  readonly t: number
}

export interface PostReview {
  readonly played: number
  readonly acc: number
  readonly mistakes: number
  readonly findings: readonly PostFinding[]
  readonly topMistakes: readonly PostTopMistake[]
  /** Найслабше місце з достатньою вибіркою — або null, поки даних мало. */
  readonly worstSlice: PostSlice | null
}

const FINDING_MIN = 2
const FINDINGS_SHOWN = 3
const TOP_SHOWN = 8

/** Найслабший зріз серед усіх вимірів — лише там, де вибірка вже щось означає. */
function worstOf(progress: PostProgress): PostSlice | null {
  const tables: [Record<string, Tally>, (k: string) => string][] = [
    [progress.byStreet, (k) => STREET_LABEL[k as 'flop'] ?? k],
    [progress.byCat, (k) => POST_CAT_LABEL[k as 'AIR'] ?? k],
    [progress.byTex, (k) => TEX_LABEL[k as 'DRY'] ?? k],
    [progress.byMode, (k) => k],
    [progress.byFacing, (k) => FACING_LABEL[k as 'none'] ?? k],
  ]

  let worst: PostSlice | null = null
  for (const [table, label] of tables) {
    for (const [key, d] of Object.entries(table)) {
      if (!d || d.t < POST_SLICE_MIN) continue
      const acc = Math.round((d.c / d.t) * 100)
      if (worst === null || acc < worst.acc) worst = { name: label(key), acc, t: d.t }
    }
  }
  return worst
}

const act = (a: PostAction): string => POST_ACT_LABEL[a]

export function buildPostReview(progress: PostProgress): PostReview {
  const log = progress.log
  const played = progress.total
  const acc = played ? Math.round(((played - log.length) / played) * 100) : 0

  const counts = new Map<PostFixKey, number>()
  for (const e of log) {
    const key = classifyPostMistake(e)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const findings: PostFinding[] = [...counts]
    .filter(([, n]) => n >= FINDING_MIN)
    .sort((a, b) => b[1] - a[1])
    .slice(0, FINDINGS_SHOWN)
    .map(([key, n]) => ({ key, n, ...POST_FIX[key] }))

  const groups = new Map<string, { n: number; e: PostMistakeEntry }>()
  for (const e of log) {
    const key = `${e.street}|${e.cat}|${e.facing}|${e.ch}|${e.co}`
    const hit = groups.get(key)
    // Зберігаємо найсвіжіший знімок споту: з ним видно, яка це була рука.
    if (hit) {
      hit.n++
      if (e.t >= hit.e.t) hit.e = e
      continue
    }
    groups.set(key, { n: 1, e })
  }

  const topMistakes: PostTopMistake[] = [...groups]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, TOP_SHOWN)
    .map(([key, { n, e }]) => ({
      key,
      cat: POST_CAT_LABEL[e.cat],
      street: STREET_LABEL[e.street],
      facing: FACING_LABEL[e.facing],
      chosen: act(e.ch),
      correct: act(e.co),
      n,
      ...(e.board === undefined ? {} : { board: e.board }),
      ...(e.hand === undefined ? {} : { hand: e.hand }),
      ...(e.ep === undefined ? {} : { ep: e.ep }),
    }))

  return { played, acc, mistakes: log.length, findings, topMistakes, worstSlice: worstOf(progress) }
}

/** Текстовий звіт — той самий формат, що в префлопі, щоб можна було нести на розбір. */
export function buildPostReport(progress: PostProgress): string {
  const r = buildPostReview(progress)
  if (r.played === 0) return 'ЗВІТ · ПОСТФЛОП\n(немає даних — зіграй кілька рук у «Тренуванні»)'

  const lines: string[] = [
    'ЗВІТ · ПОСТФЛОП',
    `Зіграно: ${r.played} рішень · точність: ${r.acc}% · помилок: ${r.mistakes}`,
  ]

  if (r.worstSlice) {
    lines.push(`Найслабше місце: ${r.worstSlice.name} — ${r.worstSlice.acc}% (${r.worstSlice.t})`)
  }

  lines.push('', 'ПАТЕРНИ:')
  if (r.findings.length === 0) lines.push('  (немає даних)')
  for (const f of r.findings) lines.push(`  ${f.title} — ${f.n}x`)

  lines.push('', 'СПОТИ (рука / вулиця / контекст / вибір → правильно / разів):')
  if (r.topMistakes.length === 0) lines.push('  (немає даних)')
  for (const m of r.topMistakes) {
    const hand = m.hand ? `${m.hand} ` : ''
    lines.push(
      `  ${hand}${m.cat} / ${m.street} / ${m.facing} / ${m.chosen} → ${m.correct} / ${m.n}x`,
    )
  }

  return lines.join('\n')
}
