/**
 * Наскрізний тест черги синку проти справжнього локального Supabase.
 *
 * rls.test.ts перевіряє політики, syncQueue.test.ts — логіку черги на моках.
 * Тут — стик: справжній клієнт, справжній RLS, справжній upsert.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SyncQueue, type QueueStorage, type QueuedAttempt } from '../../web/src/api/syncQueue'
import type { Db } from '../../web/src/api/supabase'

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env['SUPABASE_ANON_KEY'] ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_KEY =
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

class MemoryStorage implements QueueStorage {
  private data = new Map<string, string>()
  getItem(k: string): string | null {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v)
  }
}

const attempt = (over: Partial<QueuedAttempt> = {}): QueuedAttempt =>
  ({
    client_id: crypto.randomUUID(),
    stage: 'pre',
    scenario: 'rfi',
    hero_pos: 'BTN',
    hand: '72o',
    chosen: 'fold',
    correct: 'fold',
    is_drill: false,
    is_control: false,
    answered_at: new Date('2026-08-01T10:00:00Z').toISOString(),
    ...over,
  }) as QueuedAttempt

let client: SupabaseClient
let userId: string
let storage: MemoryStorage
let authenticated = true

beforeAll(async () => {
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id)

  const created = await admin.auth.admin.createUser({
    email: 'sync@example.com',
    password: 'test-password-123',
    email_confirm: true,
  })
  if (created.error || !created.data.user) throw created.error ?? new Error('немає користувача')
  userId = created.data.user.id

  client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await client.auth.signInWithPassword({
    email: 'sync@example.com',
    password: 'test-password-123',
  })
  if (signIn.error) throw signIn.error
}, 60_000)

afterAll(async () => {
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id)
})

beforeEach(async () => {
  const { error } = await admin.from('attempts').delete().gte('id', 0)
  if (error) throw new Error(`не вдалося очистити attempts: ${error.message}`)
  storage = new MemoryStorage()
  authenticated = true
})

const makeQueue = () =>
  new SyncQueue({
    db: client as unknown as Db,
    storage,
    isAuthenticated: () => authenticated,
  })

const countRows = async (): Promise<number> => {
  const { count } = await admin.from('attempts').select('*', { count: 'exact', head: true })
  return count ?? 0
}

describe('наскрізний синк', () => {
  it('події з черги доїжджають у базу з правильним user_id', async () => {
    const q = makeQueue()
    q.enqueue(attempt({ hand: 'AA', chosen: 'raise', correct: 'raise' }))
    q.enqueue(attempt({ hand: '72o' }))

    const r = await q.flush()
    expect(r.status).toBe('ok')
    expect(r.sent).toBe(2)
    expect(q.size).toBe(0)

    const { data } = await admin.from('attempts').select('*').order('hand')
    expect(data).toHaveLength(2)
    expect(data?.every((row) => row.user_id === userId)).toBe(true)
    // is_correct рахує база з пари (chosen, correct).
    expect(data?.find((r) => r.hand === 'AA')?.is_correct).toBe(true)
    expect(data?.find((r) => r.hand === '72o')?.is_correct).toBe(true)
  })

  it('повторний флаш тих самих подій не дублює рядків', async () => {
    const q = makeQueue()
    const events = [attempt({ hand: 'AA' }), attempt({ hand: 'KK' })]
    for (const e of events) q.enqueue(e)
    await q.flush()
    expect(await countRows()).toBe(2)

    // Симулюємо збій, після якого клієнт вирішив, що не відправив.
    for (const e of events) q.enqueue(e)
    const second = await q.flush()
    expect(second.status).toBe('ok')
    expect(await countRows(), 'дублів бути не має').toBe(2)
  })

  it('офлайн-накопичення доїжджає одним батчем після відновлення', async () => {
    const q = makeQueue()
    authenticated = false
    for (let i = 0; i < 25; i++) q.enqueue(attempt({ hand: 'AA' }))

    expect((await q.flush()).status).toBe('unauthenticated')
    expect(await countRows()).toBe(0)
    expect(q.size).toBe(25)

    authenticated = true
    const r = await q.flush()
    expect(r.status).toBe('ok')
    expect(r.sent).toBe(25)
    expect(await countRows()).toBe(25)
    expect(q.size).toBe(0)
  })

  it('контекст споту зберігається повністю', async () => {
    const q = makeQueue()
    q.enqueue(
      attempt({
        scenario: 'vsraise',
        hero_pos: 'BB',
        villain_pos: 'CO',
        hand: 'A5s',
        chosen: 'call',
        correct: 'raise',
        is_drill: true,
        is_control: false,
      }),
    )
    q.enqueue(attempt({ scenario: 'iso', hero_pos: 'BTN', limpers: 2, hand: 'KQo' }))
    await q.flush()

    const { data } = await admin.from('attempts').select('*').order('scenario')
    const iso = data?.find((r) => r.scenario === 'iso')
    const vs = data?.find((r) => r.scenario === 'vsraise')

    expect(iso?.limpers).toBe(2)
    expect(iso?.villain_pos).toBeNull()
    expect(vs?.villain_pos).toBe('CO')
    expect(vs?.limpers).toBeNull()
    expect(vs?.is_drill).toBe(true)
    expect(vs?.is_correct).toBe(false)
  })

  it('відхилений сервером батч лишається в черзі й не втрачається', async () => {
    const q = makeQueue()
    // hand не проходить check-обмеження — сервер відхилить увесь батч.
    q.enqueue(attempt({ hand: 'ZZZ' }))
    q.enqueue(attempt({ hand: 'AA' }))

    const r = await q.flush()
    expect(r.status).toBe('error')
    expect(await countRows()).toBe(0)
    expect(q.size, 'події мають лишитись для розбору, а не зникнути').toBe(2)
  })
})
