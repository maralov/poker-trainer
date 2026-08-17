/**
 * Звідки беруться цифри Етапу 2: сервер, якщо є логін, інакше локальний буфер.
 *
 * Дзеркалить statsSource.ts префлопу навмисно — щоб обидва етапи поводились
 * однаково і правились в одному місці подумки.
 */

import { useEffect, useMemo } from 'react'
import { create } from 'zustand'

import { usePostSyncStore } from '../api/postSync'
import { fetchServerPostProgress } from '../api/serverPostProgress'
import type { PostProgress } from '../engine/postflop'
import { useAuthStore } from './authStore'
import { mergePostProgress } from './mergePostProgress'
import { useProgressStore } from './progressStore'

interface ServerPostState {
  progress: PostProgress | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  reset: () => void
}

export const useServerPostStats = create<ServerPostState>()((set) => ({
  progress: null,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const { progress } = await fetchServerPostProgress()
      set({ progress, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'помилка мережі' })
    }
  },
  reset: () => set({ progress: null, error: null }),
}))

export interface PostStatsSource {
  readonly progress: PostProgress
  /** Дані з сервера — тобто зведені з усіх пристроїв. */
  readonly fromServer: boolean
  /** Скільки рішень ще не доїхало. */
  readonly pending: number
  readonly loading: boolean
  readonly error: string | null
}

export function usePostStatsSource(): PostStatsSource {
  const local = useProgressStore((s) => s.post)
  const session = useAuthStore((s) => s.session)
  const server = useServerPostStats((s) => s.progress)
  const loading = useServerPostStats((s) => s.loading)
  const error = useServerPostStats((s) => s.error)
  const refresh = useServerPostStats((s) => s.refresh)
  const reset = useServerPostStats((s) => s.reset)
  const pending = usePostSyncStore((s) => s.pending)
  const queued = usePostSyncStore((s) => s.queued)

  useEffect(() => {
    if (session) void refresh()
    else reset()
  }, [session, refresh, reset])

  // Серверні цифри плюс те, що ще в черзі: інакше лічильник після відповіді
  // не рухався б до наступного синку.
  const progress = useMemo(
    () => (server ? mergePostProgress(server, queued) : local),
    [server, local, queued],
  )

  return { progress, fromServer: server !== null, pending, loading, error }
}
