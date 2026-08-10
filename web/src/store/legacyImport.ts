/**
 * Одноразовий імпорт прогресу зі standalone-версії (ключ `poker_trainer_v3`).
 *
 * Дані з localStorage — недовірені: там може лежати будь-що від старих версій
 * або від ручного редагування. Тому кожне поле перевіряється, а не приймається
 * на віру; усе непізнане просто відкидається.
 */

import {
  emptyPreProgress,
  type MistakeEntry,
  type PreProgress,
  type RecentEntry,
  type Tally,
} from '../engine/progress'
import { isHand } from '../engine/ranges'
import { ACTION_ORDER, SCENARIO_KEYS, type Action, type Position, type Scenario } from '../engine/types'

export const LEGACY_KEY = 'poker_trainer_v3'

const POSITIONS: ReadonlySet<string> = new Set(ACTION_ORDER)
const SCENARIOS: ReadonlySet<string> = new Set(SCENARIO_KEYS)
const ACTIONS: ReadonlySet<string> = new Set(['raise', 'call', 'fold'])

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isPosition = (v: unknown): v is Position => typeof v === 'string' && POSITIONS.has(v)
const isScenario = (v: unknown): v is Scenario => typeof v === 'string' && SCENARIOS.has(v)
const isAction = (v: unknown): v is Action => typeof v === 'string' && ACTIONS.has(v)

/** Невід'ємне ціле або 0. */
const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0

const tally = (v: unknown): Tally | null => {
  if (!isRecord(v)) return null
  const t = num(v['t'])
  const c = num(v['c'])
  if (t === 0) return null
  return { t, c: Math.min(c, t) }
}

const tallyMap = (v: unknown, keyOk: (k: string) => boolean): Record<string, Tally> => {
  const out: Record<string, Tally> = {}
  if (!isRecord(v)) return out
  for (const [k, raw] of Object.entries(v)) {
    if (!keyOk(k)) continue
    const d = tally(raw)
    if (d) out[k] = d
  }
  return out
}

export interface LegacyImport {
  readonly pre: PreProgress
  readonly postUnlocked: boolean
  /** Скільки записів журналу прийнято — показуємо користувачеві. */
  readonly importedMistakes: number
  readonly importedRecent: number
}

/**
 * Розбирає сирий JSON зі старого ключа. `null` — нічого корисного не знайдено.
 */
export function parseLegacy(raw: string): LegacyImport | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  const pre = isRecord(parsed['pre']) ? parsed['pre'] : null
  const post = isRecord(parsed['post']) ? parsed['post'] : null
  if (!pre) return null

  const out = emptyPreProgress()
  out.total = num(pre['total'])
  out.correct = Math.min(num(pre['correct']), out.total)
  out.best = num(pre['best'])

  out.byPos = tallyMap(pre['byPos'], (k) => POSITIONS.has(k))
  out.byScen = tallyMap(pre['byScen'], (k) => SCENARIOS.has(k))

  if (isRecord(pre['byScenPos'])) {
    for (const [scen, inner] of Object.entries(pre['byScenPos'])) {
      if (!SCENARIOS.has(scen)) continue
      const m = tallyMap(inner, (k) => POSITIONS.has(k))
      if (Object.keys(m).length) out.byScenPos[scen] = m
    }
  }

  if (isRecord(pre['missed'])) {
    for (const [k, v] of Object.entries(pre['missed'])) {
      const [s, p, h] = k.split('|')
      if (!isScenario(s) || !isPosition(p) || h === undefined || !isHand(h)) continue
      const w = num(v)
      if (w > 0) out.missed[k] = w
    }
  }

  if (Array.isArray(pre['log'])) {
    for (const e of pre['log']) {
      if (!isRecord(e)) continue
      const { s, p, h, ch, co, t } = e
      if (!isScenario(s) || !isPosition(p) || typeof h !== 'string' || !isHand(h)) continue
      if (!isAction(ch) || !isAction(co)) continue
      const entry: MistakeEntry = { s, p, h, ch, co, t: num(t) }
      out.log.push(entry)
    }
  }

  if (Array.isArray(pre['recent'])) {
    for (const e of pre['recent']) {
      if (!isRecord(e)) continue
      const { s, p, ok } = e
      if (!isScenario(s) || !isPosition(p)) continue
      const entry: RecentEntry = { s, p, ok: ok ? 1 : 0 }
      out.recent.push(entry)
    }
  }

  const drill = isRecord(pre['drill']) ? pre['drill'] : null
  if (drill) {
    if (isRecord(drill['streaks'])) {
      for (const [k, v] of Object.entries(drill['streaks'])) {
        const [s, p, h] = k.split('|')
        if (!isScenario(s) || !isPosition(p) || h === undefined || !isHand(h)) continue
        out.drill.streaks[k] = num(v)
      }
    }
    if (isRecord(drill['recent'])) {
      for (const [scen, arr] of Object.entries(drill['recent'])) {
        if (!SCENARIOS.has(scen) || !Array.isArray(arr)) continue
        out.drill.recent[scen] = arr.map((x): 0 | 1 => (x ? 1 : 0))
      }
    }
  }

  // Порожній прогрес імпортувати немає сенсу — не показуємо користувачеві
  // повідомлення про «перенесено 0 рук».
  if (out.total === 0 && out.log.length === 0 && out.recent.length === 0) return null

  return {
    pre: out,
    postUnlocked: post?.['unlocked'] === true,
    importedMistakes: out.log.length,
    importedRecent: out.recent.length,
  }
}

/** Читає старий ключ із localStorage. Безпечно до відсутнього сховища. */
export function readLegacy(storage: Storage | undefined = globalThis.localStorage): LegacyImport | null {
  try {
    const raw = storage?.getItem(LEGACY_KEY)
    return raw ? parseLegacy(raw) : null
  } catch {
    return null
  }
}
