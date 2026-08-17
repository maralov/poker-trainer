/**
 * Серверний прогрес Етапу 2 плюс те, що ще не доїхало.
 *
 * Без цього цифри «відкочувались» би після кожної відповіді, поки батч у
 * дорозі — і виглядало б це як загублений прогрес.
 */

import type { QueuedPostAttempt } from '../api/postSync'
import {
  recordPostAnswer,
  type Facing,
  type PostAction,
  type PostCategory,
  type PostProgress,
  type Street,
  type Texture,
} from '../engine/postflop'

export function mergePostProgress(
  server: PostProgress,
  queued: readonly QueuedPostAttempt[],
): PostProgress {
  if (queued.length === 0) return server

  const merged = structuredClone(server)
  // Серія рахується заново по хвосту: сервер віддає лише рекорд, а не те,
  // на чому обірвалась поточна.
  let streak = 0
  for (const row of queued) {
    const result = recordPostAnswer(merged, streak, {
      street: row.street as Street,
      cat: row.category as PostCategory,
      texture: row.texture as Texture,
      facing: row.facing as Facing,
      nOpps: row.n_opps,
      ip: row.ip,
      chosen: row.chosen as PostAction,
      correct: row.correct as PostAction,
      at: Date.parse(row.answered_at),
      episodeId: row.episode_id,
      board: row.board,
      hand: row.hand,
    })
    streak = result.streak
  }
  return merged
}
