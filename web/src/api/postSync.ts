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
      .upsert([...batch], { onConflict: 'user_id,client_id', ignoreDuplicates: true }),
})

export interface PostSyncState {
  pending: number
  /** Знімок черги — щоб React бачив зміни, а не лише лічильник. */
  queued: QueuedPostAttempt[]
}

export const usePostSyncStore = create<PostSyncState>()(() => ({
  pending: postQueue.size,
  queued: postQueue.peek(),
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
  await postQueue.flush(force)
  refresh()
}
