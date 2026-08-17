/**
 * Серверний прогрес Етапу 2.
 *
 * Збирається в ту саму структуру PostProgress, що й локальний буфер, — тому
 * інтерфейс не знає, звідки взялись цифри, і працює однаковим кодом для обох
 * джерел. Це те саме рішення, що вже діє для префлопу (serverProgress.ts).
 */

import {
  emptyPostProgress,
  type PostMistakeEntry,
  type PostProgress,
} from '../engine/postflop'
import type {
  Facing,
  PostAction,
  PostCategory,
  Street,
  Texture,
} from '../engine/postflop'
import { supabase } from './supabase'

const MISTAKES_LIMIT = 500

export interface ServerPostProgress {
  readonly progress: PostProgress
  readonly fetchedAt: number
  /** Мітка скидання, ms; null — рахується вся історія. */
  readonly resetAt: number | null
}

/** Ключ зрізу в SQL → поле PostProgress. Лише поля-таблиці, тож без приведень. */
type SliceField = 'byStreet' | 'byCat' | 'byTex' | 'byFacing' | 'byMode'

const DIMENSIONS: Readonly<Record<string, SliceField>> = {
  street: 'byStreet',
  category: 'byCat',
  texture: 'byTex',
  facing: 'byFacing',
  mode: 'byMode',
}

export async function fetchServerPostProgress(): Promise<ServerPostProgress> {
  const [summary, totals, mistakes] = await Promise.all([
    supabase.rpc('postflop_summary'),
    supabase.rpc('postflop_totals'),
    supabase.rpc('postflop_mistakes', { max_rows: MISTAKES_LIMIT }),
  ])

  const failed = [summary, totals, mistakes].find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)

  const p = emptyPostProgress()
  let resetAt: number | null = null

  const s = summary.data?.[0]
  if (s) {
    p.total = Number(s.total)
    p.correct = Number(s.correct)
    p.best = Number(s.best_streak)
    resetAt = s.reset_at ? Date.parse(s.reset_at) : null
  }

  for (const row of totals.data ?? []) {
    const field = DIMENSIONS[row.dimension]
    if (!field) continue
    p[field][row.bucket] = { t: Number(row.played), c: Number(row.correct) }
  }

  p.log = (mistakes.data ?? []).map(
    (r): PostMistakeEntry => ({
      street: r.street as Street,
      cat: r.category as PostCategory,
      tex: r.texture as Texture,
      facing: r.facing as Facing,
      n: r.n_opps,
      ip: r.ip ? 1 : 0,
      ch: r.chosen as PostAction,
      co: r.correct as PostAction,
      t: Date.parse(r.answered_at),
    }),
  )

  return { progress: p, fetchedAt: Date.now(), resetAt }
}
