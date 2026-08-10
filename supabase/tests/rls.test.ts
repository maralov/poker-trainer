/**
 * Інтеграційні тести RLS і SQL-функцій проти локального стека Supabase.
 *
 * Вимагають `npm run db:start`. Ключі нижче — стандартні ключі локальної
 * розробки Supabase CLI: вони однакові у всіх і не є секретами.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

interface Actor {
  id: string
  email: string
  client: SupabaseClient
}

async function createActor(email: string): Promise<Actor> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`не вдалося створити ${email}: ${error?.message}`)

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await client.auth.signInWithPassword({
    email,
    password: 'test-password-123',
  })
  if (signIn.error) throw new Error(`не вдалося увійти як ${email}: ${signIn.error.message}`)

  return { id: data.user.id, email, client }
}

const attempt = (over: Record<string, unknown> = {}) => ({
  client_id: crypto.randomUUID(),
  stage: 'pre',
  scenario: 'rfi',
  hero_pos: 'BTN',
  hand: '72o',
  chosen: 'fold',
  correct: 'fold',
  answered_at: new Date('2026-08-01T10:00:00Z').toISOString(),
  ...over,
})

let alice: Actor
let bob: Actor
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

beforeAll(async () => {
  // Перевіряємо помилку явно: мовчазний no-op тут зробив би тести залежними
  // від порядку виконання, і саме так вони одного разу вже «зелено» брехали.
  const { error: cleanupError } = await admin.from('attempts').delete().gte('id', 0)
  if (cleanupError) throw new Error(`не вдалося очистити attempts: ${cleanupError.message}`)
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id)

  alice = await createActor('alice@example.com')
  bob = await createActor('bob@example.com')
}, 60_000)

afterAll(async () => {
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id)
})

describe('RLS: ізоляція користувачів', () => {
  it('user_id проставляється сам — клієнт його не надсилає', async () => {
    const { data, error } = await alice.client.from('attempts').insert(attempt()).select().single()
    expect(error).toBeNull()
    expect(data?.user_id).toBe(alice.id)
  })

  it('користувач бачить лише свої спроби', async () => {
    await alice.client.from('attempts').insert(attempt({ hand: 'AA' }))
    await bob.client.from('attempts').insert(attempt({ hand: 'KK' }))

    const seenByAlice = await alice.client.from('attempts').select('hand, user_id')
    expect(seenByAlice.error).toBeNull()
    expect(seenByAlice.data?.every((r) => r.user_id === alice.id)).toBe(true)
    expect(seenByAlice.data?.some((r) => r.hand === 'KK')).toBe(false)

    const seenByBob = await bob.client.from('attempts').select('hand, user_id')
    expect(seenByBob.data?.every((r) => r.user_id === bob.id)).toBe(true)
    expect(seenByBob.data?.some((r) => r.hand === 'AA')).toBe(false)
  })

  it('не можна вставити рядок від імені іншого користувача', async () => {
    const { error } = await alice.client
      .from('attempts')
      .insert(attempt({ user_id: bob.id }))
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501') // insufficient_privilege — спрацювала WITH CHECK
  })

  it('журнал незмінний: власник не може змінити свій запис', async () => {
    const { data } = await alice.client
      .from('attempts')
      .insert(attempt({ chosen: 'raise' }))
      .select()
      .single()
    expect(data).not.toBeNull()

    const upd = await alice.client
      .from('attempts')
      .update({ chosen: 'fold' })
      .eq('id', data!.id)
      .select()
    // Політики UPDATE немає — рядок просто не потрапляє під зміну.
    expect(upd.data ?? []).toHaveLength(0)

    const after = await alice.client.from('attempts').select('chosen').eq('id', data!.id).single()
    expect(after.data?.chosen).toBe('raise')
  })

  it('власник може видалити свій запис — дані належать йому', async () => {
    // Незмінність журналу лишається в силі щодо ПЕРЕПИСУВАННЯ (див. тест вище):
    // рядок не можна змінити заднім числом. Але стерти свої дані користувач
    // має могти — саме на цьому тримається «Видалити весь мій прогрес».
    const { data } = await alice.client.from('attempts').insert(attempt()).select().single()

    const del = await alice.client.from('attempts').delete().eq('id', data!.id).select()
    expect(del.data).toHaveLength(1)

    const gone = await alice.client.from('attempts').select('id').eq('id', data!.id)
    expect(gone.data).toHaveLength(0)
  })

  it('видалити чужий запис не можна', async () => {
    const { data } = await bob.client.from('attempts').insert(attempt()).select().single()

    const del = await alice.client.from('attempts').delete().eq('id', data!.id).select()
    expect(del.data ?? []).toHaveLength(0)

    const still = await bob.client.from('attempts').select('id').eq('id', data!.id)
    expect(still.data).toHaveLength(1)
  })

  it('анонім не читає і не пише', async () => {
    const read = await anon.from('attempts').select('id')
    expect(read.data ?? []).toHaveLength(0)

    const write = await anon.from('attempts').insert(attempt())
    expect(write.error).not.toBeNull()
  })
})

describe('Ідемпотентність синку', () => {
  it('повторний батч з тими самими client_id не створює дублів', async () => {
    const batch = [
      attempt({ client_id: 'fixed-1', hand: 'AA' }),
      attempt({ client_id: 'fixed-2', hand: 'KK' }),
    ]

    const first = await alice.client
      .from('attempts')
      .upsert(batch, { onConflict: 'user_id,client_id', ignoreDuplicates: true })
      .select()
    expect(first.error).toBeNull()
    expect(first.data).toHaveLength(2)

    const second = await alice.client
      .from('attempts')
      .upsert(batch, { onConflict: 'user_id,client_id', ignoreDuplicates: true })
      .select()
    expect(second.error).toBeNull()
    expect(second.data ?? []).toHaveLength(0)

    const rows = await alice.client
      .from('attempts')
      .select('client_id')
      .in('client_id', ['fixed-1', 'fixed-2'])
    expect(rows.data).toHaveLength(2)
  })

  it('той самий client_id у різних користувачів — це різні рядки', async () => {
    const shared = { client_id: 'shared-id', hand: 'QQ' }
    const a = await alice.client.from('attempts').insert(attempt(shared)).select()
    const b = await bob.client.from('attempts').insert(attempt(shared)).select()
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
  })
})

describe('Обмеження цілісності', () => {
  it('is_correct рахує база, а не клієнт', async () => {
    const { data } = await alice.client
      .from('attempts')
      .insert(attempt({ chosen: 'raise', correct: 'fold' }))
      .select()
      .single()
    expect(data?.is_correct).toBe(false)

    const ok = await alice.client
      .from('attempts')
      .insert(attempt({ chosen: 'raise', correct: 'raise' }))
      .select()
      .single()
    expect(ok.data?.is_correct).toBe(true)
  })

  it.each([
    ['невідомий сценарій', { scenario: 'holdem' }],
    ['невідома позиція', { hero_pos: 'DEALER' }],
    ['невідома дія', { chosen: 'shove' }],
    ['непридатна рука', { hand: 'ZZZ' }],
    ['завелика кількість лімперів', { limpers: 99 }],
    ['невідомий етап', { stage: 'turn' }],
  ])('відхиляє %s', async (_name, bad) => {
    const { error } = await alice.client.from('attempts').insert(attempt(bad))
    expect(error).not.toBeNull()
  })
})

describe('SQL-функції', () => {
  beforeAll(async () => {
    // Перевіряємо помилку явно: мовчазний no-op тут зробив би тести залежними
  // від порядку виконання, і саме так вони одного разу вже «зелено» брехали.
  const { error: cleanupError } = await admin.from('attempts').delete().gte('id', 0)
  if (cleanupError) throw new Error(`не вдалося очистити attempts: ${cleanupError.message}`)
    const rows = [
      // Alice: rfi/UTG 3 з 4, iso/UTG 1 з 2
      ...Array.from({ length: 4 }, (_, i) =>
        attempt({
          scenario: 'rfi',
          hero_pos: 'UTG',
          chosen: i < 3 ? 'fold' : 'raise',
          correct: 'fold',
          answered_at: new Date(Date.UTC(2026, 7, 1, 10, i)).toISOString(),
        }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        attempt({
          scenario: 'iso',
          hero_pos: 'UTG',
          chosen: i < 1 ? 'fold' : 'raise',
          correct: 'fold',
          answered_at: new Date(Date.UTC(2026, 7, 1, 11, i)).toISOString(),
        }),
      ),
    ]
    await alice.client.from('attempts').insert(rows)
    // Боб має свої дані — вони не мають потрапити в цифри Аліси.
    await bob.client.from('attempts').insert(
      Array.from({ length: 10 }, (_, i) =>
        attempt({
          scenario: 'rfi',
          hero_pos: 'UTG',
          chosen: 'raise',
          correct: 'fold',
          answered_at: new Date(Date.UTC(2026, 7, 1, 12, i)).toISOString(),
        }),
      ),
    )
  })

  it('stats_totals рахує в межах свого користувача', async () => {
    const { data, error } = await alice.client.rpc('stats_totals')
    expect(error).toBeNull()
    const rfi = data?.find((r) => r.scenario === 'rfi' && r.hero_pos === 'UTG')
    expect(rfi).toEqual({ scenario: 'rfi', hero_pos: 'UTG', played: 4, correct: 3 })
  })

  it('stats_totals не змішує позиції між сценаріями', async () => {
    const { data } = await alice.client.rpc('stats_totals')
    const iso = data?.find((r) => r.scenario === 'iso' && r.hero_pos === 'UTG')
    expect(iso).toEqual({ scenario: 'iso', hero_pos: 'UTG', played: 2, correct: 1 })
    // Та сама позиція, інший сценарій — окремий рядок, а не сума.
    const total = data?.reduce((s, r) => s + Number(r.played), 0)
    expect(total).toBe(6)
  })

  it('stats_summary рахує найдовшу серію', async () => {
    const { data, error } = await alice.client.rpc('stats_summary')
    expect(error).toBeNull()
    const row = data?.[0]
    expect(row?.total).toBe(6)
    expect(row?.correct).toBe(4)
    // Хронологія: rfi ✓✓✓✗, потім iso ✓✗ → найдовша серія 3.
    expect(row?.best_streak).toBe(3)
  })

  it('recent_attempts віддає хвіст у хронологічному порядку', async () => {
    const { data, error } = await alice.client.rpc('recent_attempts', { window_size: 3 })
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    // Останні три за часом: rfi(11:00 немає) → iso 11:00, 11:01 і rfi 10:03
    expect(data?.map((r) => r.scenario)).toEqual(['rfi', 'iso', 'iso'])
    expect(data?.map((r) => r.is_correct)).toEqual([false, true, false])
  })

  it('mistakes віддає лише помилки заданого сценарію', async () => {
    const { data, error } = await alice.client.rpc('mistakes', { target_scenario: 'rfi' })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]).toMatchObject({ scenario: 'rfi', hero_pos: 'UTG', chosen: 'raise' })
  })

  it('функції не показують чужих даних', async () => {
    const { data } = await bob.client.rpc('stats_summary')
    expect(data?.[0]?.total).toBe(10)
    expect(data?.[0]?.correct).toBe(0)
  })

  it('анонім отримує порожні агрегати, а не чужі', async () => {
    const { data } = await anon.rpc('stats_totals')
    expect(data ?? []).toHaveLength(0)
  })
})
