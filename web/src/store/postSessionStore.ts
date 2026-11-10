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
  nextDrillSpot,
  postDrillPool,
  startEpisode,
  type EpisodeEnd,
  type EpisodeState,
  type HeroDecision,
  type PostAction,
  type PostDrillTarget,
  type PostScenario,
} from '../engine/postflop'
import { getPostStatsProgress } from './postStatsSource'
import { useProgressStore } from './progressStore'

export interface PostFeedback {
  readonly ok: boolean
  readonly chosen: PostAction
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
  scenario: PostScenario
  /** Увімкнено drill по патернах помилок. */
  drillOn: boolean
  /** Що тренує поточний drill-спот; null — звичайна роздача. */
  drillTarget: PostDrillTarget | null

  deal: () => void
  answer: (chosen: PostAction) => void
  continueHand: () => void
  setScenario: (scenario: PostScenario) => void
  startDrill: () => void
  stopDrill: () => void
}

export const usePostSessionStore = create<PostSessionState>()((set, get) => ({
  episode: null,
  decision: null,
  feedback: null,
  handOver: null,
  streak: 0,
  scenario: 'rfi',
  drillOn: false,
  drillTarget: null,

  deal: () => {
    const id = crypto.randomUUID()
    if (get().drillOn) {
      const spot = nextDrillSpot(postDrillPool(getPostStatsProgress()), { id })
      if (spot) {
        set({
          episode: spot.episode,
          decision: heroDecision(spot.episode),
          feedback: null,
          handOver: null,
          drillTarget: spot.target,
        })
        return
      }
      // Пул вичерпався просто зараз — тихо виходимо з drill, як і в префлопі.
      set({ drillOn: false })
    }

    const episode = startEpisode({ scenario: get().scenario, id })
    set({
      episode,
      decision: heroDecision(episode),
      feedback: null,
      handOver: null,
      drillTarget: null,
    })
  },

  answer: (chosen) => {
    const { episode, decision, feedback, drillTarget } = get()
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
        // Знімок споту для розбору: без нього в журналі видно категорію, але не
        // видно, яка це була рука і яка роздача.
        episodeId: episode.id,
        board: boardCode(d.board),
        hand: d.hand,
        ...(drillTarget ? { drill: drillTarget.fix } : {}),
      },
      get().streak,
    )

    recordPostAttempt({
      client_id: crypto.randomUUID(),
      episode_id: episode.id,
      line: episode.line,
      // Сценарій епізоду, а не обраний чіп: drill роздає з усіх трьох.
      scenario: episode.scenario,
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
      is_drill: drillTarget !== null,
      drill_fix: drillTarget?.fix ?? null,
    })

    set({
      feedback: { ok: result.ok, chosen, correct: d.correct, why: d.why },
      streak: record.streak,
      handOver: result.finished,
    })
  },

  continueHand: () => {
    const { episode, handOver, drillTarget } = get()
    // Drill — одне рішення на спот: решту роздачі не дограємо.
    if (!episode || handOver || drillTarget) {
      get().deal()
      return
    }
    set({ decision: heroDecision(episode), feedback: null })
  },

  setScenario: (scenario) => {
    set({ scenario })
    get().deal()
  },

  startDrill: () => {
    set({ drillOn: true })
    get().deal()
  },

  stopDrill: () => {
    set({ drillOn: false })
    get().deal()
  },
}))
