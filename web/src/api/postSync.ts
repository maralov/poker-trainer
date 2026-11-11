/**
 * Черга синку постфлопу (Етап 2).
 *
 * Окремий інстанс тієї самої SyncQueue з власним ключем у localStorage:
 * таблиці в етапів різні, і затик на одному не має тримати інший. Розклад
 * відправки спільний — його веде sync.ts, тут лише сама черга і лічильник
 * для інтерфейсу.
 */

import { create } from 'zustand'

import { useAuthStore } from '../store/authStore'
import { supabase, type PostflopAttemptInsert } from './supabase'
import { POST_QUEUE_KEY, SyncQueue } from './syncQueue'

export type QueuedPostAttempt = PostflopAttemptInsert & { client_id: string }

export const postQueue = new SyncQueue<QueuedPostAttempt>({
  storage: globalThis.localStorage,
  isAuthenticated: () => useAuthStore.getState().session !== null,
  storageKey: POST_QUEUE_KEY,
  // async, а не пряме повернення білдера: PostgrestFilterBuilder — PromiseLike,
  // і без await він не звужується до Promise<SendResult>.
  send: async (batch) =>
    await supabase
      .from('postflop_attempts')
      .upsert([...batch], {
        onConflict: 'user_id,client_id',
        ignoreDuplicates: true,
        // У черзі можуть лежати рядки старої форми (без is_drill/drill_fix).
        // За замовчуванням PostgREST підставив би їм NULL замість дефолту
        // колонки, NOT NULL відкинув би весь батч — і черга застрягла б назавжди.
        defaultToNull: false,
      }),
})

export interface PostSyncState {
  pending: number
  /** Знімок черги — щоб React бачив зміни, а не лише лічильник. */
  queued: QueuedPostAttempt[]
  /**
   * Час останньої успішної відправки, ms. Без нього серверні цифри не
   * перечитувались би: черга спорожніла, а сервер ще старий — і прогрес
   * (зокрема серії drill) відкочувався б до наступного входу.
   */
  lastSyncedAt: number | null
}

export const usePostSyncStore = create<PostSyncState>()(() => ({
  pending: postQueue.size,
  queued: postQueue.peek(),
  lastSyncedAt: null,
}))

const refresh = (): void => {
  usePostSyncStore.setState({ pending: postQueue.size, queued: postQueue.peek() })
}

/** Кладе рішення в чергу і, якщо накопичилось достатньо, одразу шле. */
export function recordPostAttempt(attempt: QueuedPostAttempt): void {
  const shouldFlush = postQueue.enqueue(attempt)
  refresh()
  if (shouldFlush) void flushPostQueue()
}

export async function flushPostQueue(force = false): Promise<void> {
  const r = await postQueue.flush(force)
  refresh()
  if (r.status === 'ok' && r.sent > 0) usePostSyncStore.setState({ lastSyncedAt: Date.now() })
}
