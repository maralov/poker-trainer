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
    const pre = useProgressStore.getState().pre

    if (drillScen) {
      const spot = drillSpot(pre, drillScen)
      // Пул вичерпався просто зараз — тихо виходимо з drill, а не показуємо порожньо.
      if (spot) {
        set({ spot, feedback: null, chosen: null })
        return
      }
      set({ drillScen: null })
    }

    set({
      spot: buildSpot({ scenarios: activeScenarios, missed: pre.missed }),
      feedback: null,
      chosen: null,
    })
  },

  answer: (chosen) => {
    const { spot, feedback, streak } = get()
    if (!spot || feedback) return

    const wasUnlocked = useProgressStore.getState().postUnlocked
    const result = useProgressStore.getState().answer(
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
    const justUnlocked = !wasUnlocked && useProgressStore.getState().postUnlocked

    // Подія йде в чергу незалежно від того, чи є мережа і чи є логін:
    // тренування не має залежати від синку.
    recordAttempt({
      client_id: crypto.randomUUID(),
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
    useProgressStore.setState((state) => {
      const pre = structuredClone(state.pre)
      pre.drill.recent[scen] = []
      return { pre }
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
