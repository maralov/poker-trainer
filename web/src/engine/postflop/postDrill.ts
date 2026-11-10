/**
 * Drill по постфлоп-помилках: пул патернів, серії, генерація спотів.
 *
 * Спека: docs/superpowers/specs/2026-11-10-postflop-drill-design.md.
 *
 * Де патерн «можливий», не задано окремою таблицею — це виводиться з
 * classifyPostMistake. Інакше класифікатор розбору і drill розійшлися б.
 */

import type { Rng } from '../types'
import type { EpisodeState } from './episode'
import { POST_DRILL_LOG_LIMIT, type PostMistakeEntry, type PostProgress } from './postProgress'
import { POST_FIX, classifyPostMistake, type PostFixKey } from './postReview'
import { answerPost, heroDecision, startEpisode, type HeroDecision } from './step'
import {
  POST_CATEGORIES,
  STREETS,
  TEXTURES,
  type Facing,
  type PostAction,
  type PostScenario,
  type Street,
} from './types'

export const POST_DRILL = {
  /** Скільки правильних поспіль (контрасти теж) закривають патерн. */
  retire: 8,
  /** Від скількох помилок у звичайній грі патерн іде в пул. */
  minMistakes: 2,
  /** Частка контрастних спотів: при 0.5 «завжди одна кнопка» дає лише половину. */
  contrastShare: 0.5,
  /** Скільки роздач перебираємо в пошуках потрібного споту. */
  maxEpisodes: 400,
} as const

export interface PostDrillTarget {
  readonly fix: PostFixKey
  /** Контрольний спот: та сама арена, але правильна дія інша. */
  readonly contrast: boolean
}

export interface PostDrillPoolItem {
  readonly fix: PostFixKey
  /** Помилок цього патерну у звичайній грі після його останнього закриття. */
  readonly n: number
  /** Поточна серія правильних поспіль у drill. */
  readonly streak: number
}

// ── Арена і правильні дії патернів ──────────────────────────────────────────

const BET_ACTIONS: readonly PostAction[] = ['check', 'b33', 'b66']
const DEFEND_ACTIONS: readonly PostAction[] = ['fold', 'call', 'raise']
const FACINGS: readonly Facing[] = ['none', 'small_bet', 'big_bet', 'raise']

const arenaKey = (street: Street, facing: Facing): string => `${street}|${facing === 'none'}`

interface FixShape {
  /** Пари (вулиця, «ставки немає»), де патерн буває. */
  readonly arena: Set<string>
  /** Правильні дії, за яких патерн буває. */
  readonly correct: Set<PostAction>
}

/**
 * Повний перебір входів класифікатора: ~10 тис. викликів, рахується один раз
 * при імпорті модуля.
 */
function buildShapes(): Record<PostFixKey, FixShape> {
  const shapes = {} as Record<PostFixKey, FixShape>
  for (const key of Object.keys(POST_FIX) as PostFixKey[]) {
    shapes[key] = { arena: new Set(), correct: new Set() }
  }
  for (const street of STREETS)
    for (const facing of FACINGS) {
      const acts =
        facing === 'none'
          ? BET_ACTIONS
          : DEFEND_ACTIONS.filter((a) => facing !== 'raise' || a !== 'raise')
      for (const cat of POST_CATEGORIES)
        for (const tex of TEXTURES)
          for (const n of [1, 2, 3])
            for (const ch of acts)
              for (const co of acts) {
                if (ch === co) continue
                const e: PostMistakeEntry = { street, cat, tex, facing, n, ip: 0, ch, co, t: 0 }
                const shape = shapes[classifyPostMistake(e)]
                shape.arena.add(arenaKey(street, facing))
                shape.correct.add(co)
              }
    }
  return shapes
}

const SHAPES = buildShapes()

/** Патерн, до якого розбір відніс би цей неправильний вибір. */
export const fixOfChoice = (d: HeroDecision, chosen: PostAction): PostFixKey =>
  classifyPostMistake({
    street: d.street,
    cat: d.cat,
    tex: d.texture,
    facing: d.facing,
    n: d.nOpps,
    ip: d.ip ? 1 : 0,
    ch: chosen,
    co: d.correct,
    t: 0,
  })

/** Патерни, до яких класифікатор відніс би хоча б одну неправильну дію в цьому споті. */
export function fixesOf(d: HeroDecision): Set<PostFixKey> {
  const out = new Set<PostFixKey>()
  for (const o of d.options) if (o.k !== d.correct) out.add(fixOfChoice(d, o.k))
  return out
}

/** Спот, що підходить цілі drill: спот патерну або його контраст. */
export function fitsTarget(target: PostDrillTarget, d: HeroDecision): boolean {
  if (!target.contrast) return fixesOf(d).has(target.fix)
  const shape = SHAPES[target.fix]
  return shape.arena.has(arenaKey(d.street, d.facing)) && !shape.correct.has(d.correct)
}

// ── Пул і серії ─────────────────────────────────────────────────────────────

/**
 * Серії й моменти закриття, відтворені з хвоста drill-відповідей.
 * Серія скидається на будь-якій помилці свого патерну, включно з контрастом.
 */
function replayDrill(progress: PostProgress): {
  streak: Map<PostFixKey, number>
  retiredAt: Map<PostFixKey, number>
} {
  const streak = new Map<PostFixKey, number>()
  const retiredAt = new Map<PostFixKey, number>()
  for (const e of progress.drillLog) {
    if (!(e.f in POST_FIX)) continue
    if (!e.ok) {
      streak.set(e.f, 0)
      continue
    }
    const s = (streak.get(e.f) ?? 0) + 1
    if (s >= POST_DRILL.retire) {
      retiredAt.set(e.f, e.t)
      streak.set(e.f, 0)
    } else {
      streak.set(e.f, s)
    }
  }
  return { streak, retiredAt }
}

/** Відкриті патерни, найчастіші першими. */
export function postDrillPool(progress: PostProgress): PostDrillPoolItem[] {
  const { streak, retiredAt } = replayDrill(progress)
  // Хвіст drill обрізаний: закриття, старше за нього, вже не видно, і патерн
  // ожив би без нових помилок. Тому гра, старша за хвіст, вважається відпрацьованою.
  const first = progress.drillLog[0]
  const horizon =
    first && progress.drillLog.length >= POST_DRILL_LOG_LIMIT ? first.t : -Infinity
  const counts = new Map<PostFixKey, number>()
  for (const e of progress.log) {
    // Drill-помилки пул не годують: інакше патерн сам себе тримав би відкритим.
    if (e.d !== undefined || e.t <= horizon) continue
    const fix = classifyPostMistake(e)
    if (e.t <= (retiredAt.get(fix) ?? -Infinity)) continue
    counts.set(fix, (counts.get(fix) ?? 0) + 1)
  }
  return [...counts]
    .filter(([, n]) => n >= POST_DRILL.minMistakes)
    .sort((a, b) => b[1] - a[1])
    .map(([fix, n]) => ({ fix, n, streak: streak.get(fix) ?? 0 }))
}

/** Ціль наступного споту: патерн зважено за кількістю помилок, контраст — монеткою. */
export function pickDrillTarget(
  pool: readonly PostDrillPoolItem[],
  rng: Rng,
  exclude: ReadonlySet<PostFixKey> = new Set(),
): PostDrillTarget | null {
  const items = pool.filter((p) => !exclude.has(p.fix))
  const total = items.reduce((s, p) => s + p.n, 0)
  if (total === 0) return null
  let x = rng() * total
  let fix = items[items.length - 1]?.fix
  for (const p of items) {
    x -= p.n
    if (x < 0) {
      fix = p.fix
      break
    }
  }
  if (fix === undefined) return null
  return { fix, contrast: rng() < POST_DRILL.contrastShare }
}

// ── Генерація ───────────────────────────────────────────────────────────────

const SCENARIOS: readonly PostScenario[] = ['rfi', 'iso', 'vsraise']

/**
 * Роздає епізоди й прокручує рішення героя за правильною дією, доки не
 * трапиться спот цілі. Повертає епізод, що стоїть саме на цьому рішенні;
 * null — за ліміт роздач такого споту не трапилось.
 */
export function startDrillEpisode(
  target: PostDrillTarget,
  options: { readonly rng?: Rng; readonly id?: string; readonly maxEpisodes?: number } = {},
): EpisodeState | null {
  const rng = options.rng ?? Math.random
  const max = options.maxEpisodes ?? POST_DRILL.maxEpisodes
  for (let i = 0; i < max; i++) {
    const scenario = SCENARIOS[Math.floor(rng() * SCENARIOS.length)] ?? 'rfi'
    const ep = startEpisode({ rng, scenario, ...(options.id === undefined ? {} : { id: options.id }) })
    for (let d = heroDecision(ep); d !== null; d = heroDecision(ep)) {
      if (fitsTarget(target, d)) return ep
      answerPost(ep, d.correct, rng)
    }
  }
  return null
}

/**
 * Наступний drill-спот: бере ціль із пулу, а якщо її спот не знайшовся за
 * ліміт — пробує інші патерни, щоб рідкісний патерн не блокував drill.
 */
export function nextDrillSpot(
  pool: readonly PostDrillPoolItem[],
  options: { readonly rng?: Rng; readonly id?: string } = {},
): { readonly episode: EpisodeState; readonly target: PostDrillTarget } | null {
  const rng = options.rng ?? Math.random
  const tried = new Set<PostFixKey>()
  for (;;) {
    const target = pickDrillTarget(pool, rng, tried)
    if (target === null) return null
    const episode =
      startDrillEpisode(target, { ...options, rng }) ??
      // Контраст рідкісного патерну буває важче знайти — спершу пробуємо сам патерн.
      (target.contrast ? startDrillEpisode({ ...target, contrast: false }, { ...options, rng }) : null)
    if (episode) {
      const d = heroDecision(episode)
      return { episode, target: d && fitsTarget(target, d) ? target : { ...target, contrast: false } }
    }
    tried.add(target.fix)
  }
}
