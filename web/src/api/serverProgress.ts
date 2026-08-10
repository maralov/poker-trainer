/**
 * Прогрес із сервера, зібраний у ту саму форму PreProgress, що й локальний.
 *
 * Завдяки цьому Stats, Review і ворота працюють з серверними даними через
 * ті самі функції engine/, які вже покриті тестами. Жодної другої реалізації
 * діагностики — ні тут, ні в SQL.
 */

import { GATE } from '../engine/gate'
import {
  emptyPreProgress,
  type MistakeEntry,
  type PreProgress,
  type RecentEntry,
} from '../engine/progress'
import { SCENARIO_KEYS, type Action, type Position, type Scenario } from '../engine/types'
import { supabase } from './supabase'

/** Скільки помилок тягнемо на сценарій: вистачає і drill-пулу, і розбору. */
const MISTAKES_LIMIT = 500

export interface ServerProgress {
  readonly progress: PreProgress
  /** Коли дані отримані, ms. */
  readonly fetchedAt: number
}

export async function fetchServerProgress(): Promise<ServerProgress> {
  const [summary, totals, recent, ...mistakesPerScenario] = await Promise.all([
    supabase.rpc('stats_summary'),
    supabase.rpc('stats_totals'),
    supabase.rpc('recent_attempts', { window_size: GATE.window }),
    ...SCENARIO_KEYS.map((s) =>
      supabase.rpc('mistakes', { target_scenario: s, max_rows: MISTAKES_LIMIT }),
    ),
  ])

  const failed = [summary, totals, recent, ...mistakesPerScenario].find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)

  const p = emptyPreProgress()

  const s = summary.data?.[0]
  if (s) {
    p.total = Number(s.total)
    p.correct = Number(s.correct)
    p.best = Number(s.best_streak)
  }

  for (const row of totals.data ?? []) {
    const scenario = row.scenario as Scenario
    const pos = row.hero_pos as Position
    const played = Number(row.played)
    const correct = Number(row.correct)

    const byScen = p.byScen[scenario] ?? { t: 0, c: 0 }
    byScen.t += played
    byScen.c += correct
    p.byScen[scenario] = byScen

    const byPos = p.byPos[pos] ?? { t: 0, c: 0 }
    byPos.t += played
    byPos.c += correct
    p.byPos[pos] = byPos

    // Зріз «позиція в межах сценарію» — саме той, що не має текти між сценаріями.
    const scenPos = p.byScenPos[scenario] ?? {}
    scenPos[pos] = { t: played, c: correct }
    p.byScenPos[scenario] = scenPos
  }

  p.recent = (recent.data ?? []).map(
    (r): RecentEntry => ({
      s: r.scenario as Scenario,
      p: r.hero_pos as Position,
      ok: r.is_correct ? 1 : 0,
    }),
  )

  p.log = mistakesPerScenario.flatMap((res) =>
    (res.data ?? []).map(
      (r): MistakeEntry => ({
        s: r.scenario as Scenario,
        p: r.hero_pos as Position,
        h: r.hand,
        ch: r.chosen as Action,
        co: r.correct as Action,
        t: Date.parse(r.answered_at),
      }),
    ),
  )
  p.log.sort((a, b) => a.t - b.t)

  return { progress: p, fetchedAt: Date.now() }
}
