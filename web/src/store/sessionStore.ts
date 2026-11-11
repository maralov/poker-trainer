/**
 * Стан поточної сесії тренування: показаний спот, серія, вибрані сценарії,
 * drill. Навмисно НЕ персистується — після перезавантаження роздається новий спот,
 * так само як у standalone-версії.
 */

import { create } from 'zustand'

import { recordAttempt } from '../api/sync'
import { drillSpot } from '../engine/drill'
import { buildSpot } from '../engine/spots'
import type { Action, Scenario, Spot } from '../engine/types'
import { useProgressStore } from './progressStore'
import { getStatsProgress } from './statsSource'
import { currentTable, useTableStore } from './tableStore'

export interface AnswerFeedback {
  readonly ok: boolean
  readonly handStreak: number
  /** Етап 2 відкрився саме цією відповіддю. */
  readonly justUnlocked: boolean
}

export interface SessionState {
  spot: Spot | null
  /** Заповнюється після відповіді; null — питання ще відкрите. */
  feedback: AnswerFeedback | null
  chosen: Action | null
  streak: number
  activeScenarios: Scenario[]
  /** Сценарій, у якому йде drill; null — звичайний режим. */
  drillScen: Scenario | null

  next: () => void
  answer: (chosen: Action) => void
  toggleScenario: (scen: Scenario) => void
  startDrill: (scen: Scenario) => void
  stopDrill: () => void
  resetSession: () => void
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  spot: null,
  feedback: null,
  chosen: null,
  streak: 0,
  activeScenarios: ['rfi'],
  drillScen: null,

  next: () => {
    const { drillScen, activeScenarios } = get()
    const table = currentTable()
    const pre = getStatsProgress(table.id)

    if (drillScen) {
      const spot = drillSpot(pre, drillScen, table)
      // Пул вичерпався просто зараз — тихо виходимо з drill, а не показуємо порожньо.
      if (spot) {
        set({ spot, feedback: null, chosen: null })
        return
      }
      set({ drillScen: null })
    }

    set({
      spot: buildSpot({ table, scenarios: activeScenarios, missed: pre.missed }),
      feedback: null,
      chosen: null,
    })
  },

  answer: (chosen) => {
    const { spot, feedback, streak } = get()
    if (!spot || feedback) return

    // Формат споту, а не поточного перемикача: між роздачею і відповіддю
    // формат міг змінитись, а подія має лягти туди, де спот зіграно.
    const table = spot.table
    const wasUnlocked = useProgressStore.getState().tables[table].postUnlocked
    const result = useProgressStore.getState().answer(
      table,
      {
        scen: spot.scen,
        heroPos: spot.heroPos,
        hand: spot.hand,
        chosen,
        correct: spot.correct,
        drill: spot.drill,
        isControl: spot.isControl,
      },
      streak,
    )
    const justUnlocked = !wasUnlocked && useProgressStore.getState().tables[table].postUnlocked

    // Подія йде в чергу незалежно від того, чи є мережа і чи є логін:
    // тренування не має залежати від синку.
    recordAttempt({
      client_id: crypto.randomUUID(),
      table_size: table,
      stage: 'pre',
      scenario: spot.scen,
      hero_pos: spot.heroPos,
      hand: spot.hand,
      villain_pos: spot.villainPos,
      limpers: spot.limpers,
      chosen,
      correct: spot.correct,
      is_drill: spot.drill,
      is_control: spot.isControl,
      answered_at: new Date().toISOString(),
    })

    set({
      chosen,
      streak: result.streak,
      feedback: { ok: result.ok, handStreak: result.handStreak, justUnlocked },
    })
  },

  toggleScenario: (scen) => {
    if (get().drillScen) return
    const active = get().activeScenarios
    const nextActive = active.includes(scen)
      ? active.length > 1
        ? active.filter((s) => s !== scen)
        : active
      : [...active, scen]
    if (nextActive === active) return
    set({ activeScenarios: nextActive })
    get().next()
  },

  startDrill: (scen) => {
    // Вікно точності drill рахується з нуля при кожному запуску.
    const table = useTableStore.getState().table
    useProgressStore.setState((state) => {
      const cur = state.tables[table]
      const pre = structuredClone(cur.pre)
      pre.drill.recent[scen] = []
      return { tables: { ...state.tables, [table]: { ...cur, pre } } }
    })
    set({ drillScen: scen })
    get().next()
  },

  stopDrill: () => {
    set({ drillScen: null })
    get().next()
  },

  resetSession: () => {
    set({ streak: 0, drillScen: null, feedback: null, chosen: null })
    get().next()
  },
}))

// Зміна формату: поточний спот належить іншому столу — роздаємо новий без
// запису відповіді. Drill теж вимикається: пул помилок у кожного формату свій.
useTableStore.subscribe((state, prev) => {
  if (state.table !== prev.table && useSessionStore.getState().spot !== null) {
    useSessionStore.getState().resetSession()
  }
})
