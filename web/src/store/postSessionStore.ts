/**
 * Стан поточної руки Етапу 2 (постфлоп): роздана роздача, рішення, що стоїть
 * перед героєм, і фідбек на останню відповідь. Навмисно НЕ персистується —
 * так само, як sessionStore.ts: після перезавантаження роздається нова рука.
 */

import { create } from 'zustand'

import { recordPostAttempt } from '../api/postSync'
import {
  answerPost,
  boardCode,
  heroDecision,
  startEpisode,
  type EpisodeEnd,
  type EpisodeState,
  type HeroDecision,
  type PostAction,
} from '../engine/postflop'
import { useProgressStore } from './progressStore'

export interface PostFeedback {
  readonly ok: boolean
  readonly correct: PostAction
  readonly why: string
}

export interface PostSessionState {
  episode: EpisodeState | null
  /** Рішення, що стоїть перед героєм зараз; null — рука вже завершена. */
  decision: HeroDecision | null
  /** Заповнюється після відповіді; null — питання ще відкрите. */
  feedback: PostFeedback | null
  /** Роздача завершилась саме цією відповіддю. */
  handOver: EpisodeEnd | null
  streak: number
  scenario: 'rfi' | 'iso'

  deal: () => void
  answer: (chosen: PostAction) => void
  continueHand: () => void
  setScenario: (scenario: 'rfi' | 'iso') => void
}

export const usePostSessionStore = create<PostSessionState>()((set, get) => ({
  episode: null,
  decision: null,
  feedback: null,
  handOver: null,
  streak: 0,
  scenario: 'rfi',

  deal: () => {
    const episode = startEpisode({ scenario: get().scenario, id: crypto.randomUUID() })
    set({
      episode,
      decision: heroDecision(episode),
      feedback: null,
      handOver: null,
    })
  },

  answer: (chosen) => {
    const { episode, decision, feedback } = get()
    // Немає що відповідати, або відповідь на це рішення вже прийнята —
    // подвійний клік не має подвоювати подію в журналі.
    if (!episode || !decision || feedback) return

    const result = answerPost(episode, chosen, Math.random)
    // Контекст рішення на момент відповіді (спека HeroDecision): відповідь
    // могла прокрутити ep.board далі, тож журнал бере знімок із result.decision,
    // а не читає стан епізоду напряму.
    const d = result.decision

    const record = useProgressStore.getState().answerPost(
      {
        street: d.street,
        cat: d.cat,
        texture: d.texture,
        facing: d.facing,
        nOpps: d.nOpps,
        ip: d.ip,
        chosen,
        correct: d.correct,
      },
      get().streak,
    )

    recordPostAttempt({
      client_id: crypto.randomUUID(),
      episode_id: episode.id,
      line: episode.line,
      scenario: get().scenario,
      hero_pos: episode.heroPos,
      opp_pos: d.oppPositions.join(','),
      n_opps: d.nOpps,
      ip: d.ip,
      street: d.street,
      board: boardCode(d.board),
      hand: d.hand,
      hole: boardCode(d.hole),
      category: d.cat,
      texture: d.texture,
      facing: d.facing,
      repeat_aggro: d.repeatAggro,
      pot_bb: d.potBB,
      chosen,
      correct: d.correct,
      answered_at: new Date().toISOString(),
    })

    set({
      feedback: { ok: result.ok, correct: d.correct, why: d.why },
      streak: record.streak,
      handOver: result.finished,
    })
  },

  continueHand: () => {
    const { episode, handOver } = get()
    if (!episode || handOver) {
      get().deal()
      return
    }
    set({ decision: heroDecision(episode), feedback: null })
  },

  setScenario: (scenario) => {
    set({ scenario })
    get().deal()
  },
}))
