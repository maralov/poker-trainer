/**
 * RLS і обмеження цілісності таблиці postflop_attempts.
 *
 * Вимагають `npm run db:start`. Ключі нижче — стандартні ключі локальної
 * розробки Supabase CLI: вони однакові у всіх і не є секретами.
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
  const signIn = await client.auth.signInWithPassword({ email, password: 'test-password-123' })
  if (signIn.error) throw new Error(`не вдалося увійти як ${email}: ${signIn.error.message}`)

  return { id: data.user.id, email, client }
}

const decision = (over: Record<string, unknown> = {}) => ({
  client_id: crypto.randomUUID(),
  episode_id: crypto.randomUUID(),
  line: 'aggressor',
  scenario: 'rfi',
  hero_pos: 'CO',
  opp_pos: 'BB',
  n_opps: 1,
  ip: true,
  street: 'flop',
  board: 'Ks7d2c',
  hand: 'AKs',
  hole: 'AsKs',
  category: 'STRONG_PAIR',
  texture: 'DRY',
  facing: 'none',
  repeat_aggro: false,
  pot_bb: 7.5,
  chosen: 'b33',
  correct: 'b33',
  answered_at: new Date('2026-08-01T10:00:00Z').toISOString(),
  ...over,
})

let alice: Actor
let bob: Actor
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const wipe = async (): Promise<void> => {
  // Помилку прибирання перевіряємо явно: мовчазний no-op зробив би тести
  // залежними від порядку виконання.
  const { error } = await admin.from('postflop_attempts').delete().gte('id', 0)
  if (error) throw new Error(`не вдалося очистити postflop_attempts: ${error.message}`)
}

beforeAll(async () => {
  await wipe()
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id)

  alice = await createActor('alice.post@example.com')
  bob = await createActor('bob.post@example.com')
}, 60_000)

beforeEach(wipe)

afterAll(async () => {
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id)
})

describe('RLS: ізоляція користувачів', () => {
  it('запис проставляє user_id автора', async () => {
    const { error } = await alice.client.from('postflop_attempts').insert(decision())
    expect(error).toBeNull()

    const { data } = await admin.from('postflop_attempts').select('user_id')
    expect(data).toHaveLength(1)
    expect(data?.[0]?.user_id).toBe(alice.id)
  })

  it('чужі рішення не видно', async () => {
    await bob.client.from('postflop_attempts').insert(decision({ hero_pos: 'BTN' }))

    const { data } = await alice.client.from('postflop_attempts').select('hero_pos')
    expect(data ?? [], 'Аліса не має бачити руку Боба').toHaveLength(0)
  })

  it('писати від чужого імені не можна', async () => {
    const { error } = await alice.client
      .from('postflop_attempts')
      .insert(decision({ user_id: bob.id }))
    expect(error).not.toBeNull()
  })

  it('без логіну не видно нічого і не пишеться нічого', async () => {
    await alice.client.from('postflop_attempts').insert(decision())

    const { data } = await anon.from('postflop_attempts').select('id')
    expect(data ?? []).toHaveLength(0)

    const { error } = await anon.from('postflop_attempts').insert(decision())
    expect(error).not.toBeNull()
  })

  it('переписати рядок журналу не може навіть автор', async () => {
    await alice.client.from('postflop_attempts').insert(decision({ chosen: 'b33' }))

    // UPDATE-політики немає навмисно: або помилка, або нуль зачеплених рядків.
    await alice.client.from('postflop_attempts').update({ chosen: 'b66' }).eq('user_id', alice.id)

    const { data } = await admin.from('postflop_attempts').select('chosen')
    expect(data?.[0]?.chosen, 'журнал незмінний').toBe('b33')
  })

  it('свої рядки видаляються, чужі — ні', async () => {
    await alice.client.from('postflop_attempts').insert(decision())
    await bob.client.from('postflop_attempts').insert(decision())

    await alice.client.from('postflop_attempts').delete().gte('id', 0)

    const { data } = await admin.from('postflop_attempts').select('user_id')
    expect(data).toHaveLength(1)
    expect(data?.[0]?.user_id, 'мав лишитись лише рядок Боба').toBe(bob.id)
  })
})

describe('Ідемпотентність синку', () => {
  it('повторний upsert того самого client_id не дублює рядок', async () => {
    const row = decision()
    const opts = { onConflict: 'user_id,client_id', ignoreDuplicates: true }

    await alice.client.from('postflop_attempts').upsert([row], opts)
    await alice.client.from('postflop_attempts').upsert([row], opts)

    const { data } = await admin.from('postflop_attempts').select('client_id')
    expect(data).toHaveLength(1)
  })

  it('рішення однієї роздачі групуються спільним episode_id', async () => {
    const episode = crypto.randomUUID()
    await alice.client.from('postflop_attempts').insert([
      decision({ episode_id: episode, street: 'flop', board: 'Ks7d2c' }),
      decision({ episode_id: episode, street: 'turn', board: 'Ks7d2cQh' }),
      decision({ episode_id: episode, street: 'river', board: 'Ks7d2cQh3s' }),
    ])

    const { data } = await alice.client
      .from('postflop_attempts')
      .select('street')
      .eq('episode_id', episode)
    expect(data).toHaveLength(3)
  })
})

describe('delete_all_progress', () => {
  it('стирає постфлоп-журнал і рахує його рядки', async () => {
    await alice.client.from('postflop_attempts').insert([decision(), decision()])

    const { data, error } = await alice.client.rpc('delete_all_progress')
    expect(error).toBeNull()
    expect(Number(data ?? 0)).toBe(2)

    const { data: left } = await admin.from('postflop_attempts').select('id')
    expect(left ?? []).toHaveLength(0)
  })

  it('чужі рядки не зникають', async () => {
    await bob.client.from('postflop_attempts').insert(decision())

    await alice.client.rpc('delete_all_progress')

    const { data } = await admin.from('postflop_attempts').select('user_id')
    expect(data).toHaveLength(1)
    expect(data?.[0]?.user_id).toBe(bob.id)
  })
})

describe('Обмеження цілісності', () => {
  it('is_correct рахує база, а не клієнт', async () => {
    await alice.client
      .from('postflop_attempts')
      .insert(decision({ chosen: 'check', correct: 'b66' }))

    const { data } = await alice.client.from('postflop_attempts').select('is_correct').single()
    expect(data?.is_correct).toBe(false)
  })

  it.each([
    ['невалідний борд', { board: 'KKK' }],
    ['борд із шести карт', { board: 'Ks7d2cQh3s4d' }],
    ['невалідна рука', { hand: 'ZZZ' }],
    ['три карти героя', { hole: 'AsKsQs' }],
    ['невалідна вулиця', { street: 'preflop' }],
    ['категорія без підтипу', { category: 'STRONG' }],
    ['префлопна дія', { chosen: '3bet' }],
    ['нульовий банк', { pot_bb: 0 }],
    ['забагато опонентів', { n_opps: 9 }],
    ['невалідна лінія', { line: 'hero' }],
  ])('%s відхиляється', async (_name, over) => {
    const { error } = await alice.client.from('postflop_attempts').insert(decision(over))
    expect(error).not.toBeNull()
  })
})

describe('postflop_episode', () => {
  it('віддає всі рішення роздачі в порядку відповідей', async () => {
    const episode = crypto.randomUUID()
    await alice.client.from('postflop_attempts').insert([
      decision({ episode_id: episode, street: 'flop', answered_at: '2026-08-01T10:00:00Z' }),
      decision({
        episode_id: episode,
        street: 'turn',
        board: 'Ks7d2c9h',
        answered_at: '2026-08-01T10:00:30Z',
      }),
      decision({
        episode_id: episode,
        street: 'river',
        board: 'Ks7d2c9hQs',
        chosen: 'b66',
        correct: 'check',
        answered_at: '2026-08-01T10:01:00Z',
      }),
      // Чужа роздача того самого користувача не має протікати в цю.
      decision({ street: 'flop' }),
    ])

    const { data, error } = await alice.client.rpc('postflop_episode', { episode })
    expect(error).toBeNull()
    expect(data?.map((r: { street: string }) => r.street)).toEqual(['flop', 'turn', 'river'])
    expect(data?.[2]?.is_correct).toBe(false)
    expect(data?.[2]?.board).toBe('Ks7d2c9hQs')
  })

  it('чужу роздачу не віддає — RLS діє і через функцію', async () => {
    const episode = crypto.randomUUID()
    await alice.client.from('postflop_attempts').insert(decision({ episode_id: episode }))

    const { data, error } = await bob.client.rpc('postflop_episode', { episode })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('postflop_mistakes', () => {
  it('віддає роздачу, борд і руку — без них розбір не покаже, що це була за рука', async () => {
    const episode = crypto.randomUUID()
    await alice.client.from('postflop_attempts').insert(
      decision({ episode_id: episode, chosen: 'b66', correct: 'check', hand: 'QJs' }),
    )

    const { data, error } = await alice.client.rpc('postflop_mistakes', { max_rows: 10 })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.episode_id).toBe(episode)
    expect(data?.[0]?.board).toBe('Ks7d2c')
    expect(data?.[0]?.hand).toBe('QJs')
    expect(data?.[0]?.line).toBe('aggressor')
  })
})
