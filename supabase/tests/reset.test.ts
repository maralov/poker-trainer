/**
 * Скидання прогресу і видалення власних даних.
 *
 * Два різні механізми з різними гарантіями, тому перевіряються окремо:
 * мітка приховує історію, але лишає її в базі; видалення стирає назавжди.
 * Плюс RLS: нові політики не мають відкрити доступ до чужих даних.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
  client: SupabaseClient
}

async function createActor(email: string): Promise<Actor> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('немає користувача')
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await client.auth.signInWithPassword({ email, password: 'test-password-123' })
  if (signIn.error) throw signIn.error
  return { id: data.user.id, client }
}

/** Спроба з керованим часом відповіді — саме за ним відсікає мітка. */
const attempt = (minutesAgo: number, over: Record<string, unknown> = {}) => ({
  client_id: crypto.randomUUID(),
  stage: 'pre',
  scenario: 'rfi',
  hero_pos: 'BTN',
  hand: '72o',
  chosen: 'fold',
  correct: 'fold',
  answered_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  ...over,
})

let alice: Actor
let bob: Actor

beforeAll(async () => {
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id)
  alice = await createActor('reset-alice@example.com')
  bob = await createActor('reset-bob@example.com')
}, 60_000)

afterAll(async () => {
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id)
})

beforeEach(async () => {
  const del = await admin.from('attempts').delete().gte('id', 0)
  if (del.error) throw new Error(del.error.message)
  const clear = await admin.from('user_settings').delete().gte('updated_at', '1970-01-01')
  if (clear.error) throw new Error(clear.error.message)
})

const totalOf = async (a: Actor): Promise<number> => {
  const { data, error } = await a.client.rpc('stats_summary')
  if (error) throw new Error(error.message)
  return Number(data?.[0]?.total ?? 0)
}

describe('reset_progress — мітка', () => {
  it('ховає стару історію, але лишає її в базі', async () => {
    await alice.client.from('attempts').insert([attempt(60), attempt(50), attempt(40)])
    expect(await totalOf(alice)).toBe(3)

    const { error } = await alice.client.rpc('reset_progress')
    expect(error).toBeNull()

    expect(await totalOf(alice), 'статистика обнулилась').toBe(0)

    // Але рядки нікуди не зникли — скидання оборотне.
    const { count } = await admin.from('attempts').select('*', { count: 'exact', head: true })
    expect(count, 'дані лишились у базі').toBe(3)
  })

  it('нові спроби після мітки рахуються', async () => {
    await alice.client.from('attempts').insert([attempt(60), attempt(50)])
    await alice.client.rpc('reset_progress')
    expect(await totalOf(alice)).toBe(0)

    await alice.client.from('attempts').insert(attempt(-1)) // на хвилину в майбутньому
    expect(await totalOf(alice)).toBe(1)
  })

  it('stats_summary повертає саму мітку — інтерфейс має що показати', async () => {
    let { data } = await alice.client.rpc('stats_summary')
    expect(data?.[0]?.reset_at).toBeNull()

    await alice.client.rpc('reset_progress')
    ;({ data } = await alice.client.rpc('stats_summary'))
    expect(data?.[0]?.reset_at).not.toBeNull()
  })

  it('мітка відсікає й розбір, і ворота, і пул помилок', async () => {
    await alice.client.from('attempts').insert([
      attempt(60, { chosen: 'raise', correct: 'fold', hand: 'K5s' }),
      attempt(50, { chosen: 'raise', correct: 'fold', hand: 'J8o' }),
    ])
    expect((await alice.client.rpc('mistakes', { target_scenario: 'rfi' })).data).toHaveLength(2)
    expect((await alice.client.rpc('recent_attempts')).data).toHaveLength(2)
    expect((await alice.client.rpc('stats_totals')).data).toHaveLength(1)

    await alice.client.rpc('reset_progress')

    expect((await alice.client.rpc('mistakes', { target_scenario: 'rfi' })).data).toHaveLength(0)
    expect((await alice.client.rpc('recent_attempts')).data).toHaveLength(0)
    expect((await alice.client.rpc('stats_totals')).data).toHaveLength(0)
  })

  it('повторне скидання пересуває мітку вперед', async () => {
    await alice.client.rpc('reset_progress')
    const first = (await alice.client.rpc('stats_summary')).data?.[0]?.reset_at

    await alice.client.from('attempts').insert(attempt(-1))
    expect(await totalOf(alice)).toBe(1)

    await alice.client.rpc('reset_progress')
    const second = (await alice.client.rpc('stats_summary')).data?.[0]?.reset_at
    expect(new Date(second).getTime()).toBeGreaterThan(new Date(first).getTime())
  })

  it('скидання не чіпає чужого прогресу', async () => {
    await alice.client.from('attempts').insert([attempt(60), attempt(50)])
    await bob.client.from('attempts').insert([attempt(60), attempt(50), attempt(40)])

    await alice.client.rpc('reset_progress')

    expect(await totalOf(alice)).toBe(0)
    expect(await totalOf(bob), 'у Боба все на місці').toBe(3)
  })
})

describe('delete_all_progress — видалення', () => {
  it('стирає спроби назавжди і знімає мітку', async () => {
    await alice.client.from('attempts').insert([attempt(60), attempt(50)])
    await alice.client.rpc('reset_progress')

    const { data, error } = await alice.client.rpc('delete_all_progress')
    expect(error).toBeNull()
    expect(Number(data)).toBe(2)

    const { count } = await admin.from('attempts').select('*', { count: 'exact', head: true })
    expect(count).toBe(0)

    // Мітка знята: наступні спроби рахуються, а не відсікаються старою міткою.
    const summary = (await alice.client.rpc('stats_summary')).data?.[0]
    expect(summary?.reset_at).toBeNull()

    await alice.client.from('attempts').insert(attempt(1))
    expect(await totalOf(alice)).toBe(1)
  })

  it('видаляє лише свої дані', async () => {
    await alice.client.from('attempts').insert([attempt(60), attempt(50)])
    await bob.client.from('attempts').insert([attempt(60), attempt(50), attempt(40)])

    await alice.client.rpc('delete_all_progress')

    const { count } = await admin.from('attempts').select('*', { count: 'exact', head: true })
    expect(count, 'рядки Боба лишились').toBe(3)
    expect(await totalOf(bob)).toBe(3)
  })

  it('на порожній історії не падає', async () => {
    const { data, error } = await alice.client.rpc('delete_all_progress')
    expect(error).toBeNull()
    expect(Number(data)).toBe(0)
  })
})

describe('RLS нових об’єктів', () => {
  it('DELETE обмежений своїми рядками', async () => {
    await bob.client.from('attempts').insert([attempt(60), attempt(50)])

    // Аліса намагається знести все, що бачить PostgREST.
    const { error } = await alice.client.from('attempts').delete().gte('id', 0).select()
    expect(error).toBeNull()

    const { count } = await admin.from('attempts').select('*', { count: 'exact', head: true })
    expect(count, 'чужі рядки недоторкані').toBe(2)
  })

  it('UPDATE спроб і далі неможливий — рядок не переписати', async () => {
    const { data } = await alice.client
      .from('attempts')
      .insert(attempt(10, { chosen: 'raise' }))
      .select()
      .single()

    const upd = await alice.client
      .from('attempts')
      .update({ chosen: 'fold' })
      .eq('id', data!.id)
      .select()
    expect(upd.data ?? []).toHaveLength(0)
  })

  it('користувач не бачить чужих налаштувань', async () => {
    await alice.client.rpc('reset_progress')
    await bob.client.rpc('reset_progress')

    const seen = await alice.client.from('user_settings').select('user_id')
    expect(seen.data).toHaveLength(1)
    expect(seen.data?.[0]?.user_id).toBe(alice.id)
  })

  it('не можна створити налаштування від імені іншого', async () => {
    const { error } = await alice.client
      .from('user_settings')
      .insert({ user_id: bob.id, reset_at: new Date().toISOString() })
    expect(error).not.toBeNull()
  })

  it('не можна пересунути чужу мітку', async () => {
    await bob.client.rpc('reset_progress')
    const upd = await alice.client
      .from('user_settings')
      .update({ reset_at: null })
      .eq('user_id', bob.id)
      .select()
    expect(upd.data ?? []).toHaveLength(0)

    const bobSettings = await bob.client.from('user_settings').select('reset_at').single()
    expect(bobSettings.data?.reset_at).not.toBeNull()
  })
})
