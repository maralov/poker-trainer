/**
 * Черга синку — те місце, де втрачаються дані користувача, якщо помилитись.
 * Тому тут перевіряються саме неприємні сценарії: офлайн, 401, помилка сервера,
 * гонка з новими відповідями під час відправки, пошкоджене сховище.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BACKOFF_MS,
  BATCH_LIMIT,
  FLUSH_AT,
  QUEUE_KEY,
  QUEUE_LIMIT,
  SyncQueue,
  type QueueStorage,
  type QueuedAttempt,
  type SendResult,
} from './syncQueue'

class MemoryStorage implements QueueStorage {
  private data = new Map<string, string>()
  getItem(k: string): string | null {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v)
  }
  raw(): string | null {
    return this.getItem(QUEUE_KEY)
  }
}

const attempt = (id: string): QueuedAttempt => ({
  client_id: id,
  scenario: 'rfi',
  hero_pos: 'BTN',
  hand: '72o',
  chosen: 'fold',
  correct: 'fold',
  answered_at: '2026-08-01T10:00:00.000Z',
})

/**
 * Підроблена відправка: фіксує надіслані батчі, вміє віддавати помилку.
 * Клієнта бази підробляти більше не треба — черга параметризована самою
 * функцією відправки, тож тест обходиться без приведень типів.
 */
function fakeSend(behaviour: { error?: string } = {}) {
  const batches: QueuedAttempt[][] = []
  const send = (batch: readonly QueuedAttempt[]): Promise<SendResult> => {
    batches.push([...batch])
    return Promise.resolve(
      behaviour.error ? { error: { message: behaviour.error } } : { error: null },
    )
  }
  return { send, batches }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  vi.unstubAllGlobals()
})

describe('накопичення', () => {
  it('сигналить про потребу відправки на десятій події', () => {
    const { send } = fakeSend()
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    for (let i = 1; i < FLUSH_AT; i++) {
      expect(q.enqueue(attempt(`e${i}`)), `подія ${i}`).toBe(false)
    }
    expect(q.enqueue(attempt(`e${FLUSH_AT}`))).toBe(true)
    expect(q.size).toBe(FLUSH_AT)
  })

  it('черга переживає перестворення обʼєкта — вона в сховищі, не в памʼяті', () => {
    const { send } = fakeSend()
    new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send }).enqueue(attempt('a'))
    const revived = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    expect(revived.size).toBe(1)
  })

  it('не росте безмежно: найстаріші події витісняються', () => {
    const { send } = fakeSend()
    // Черга наповнюється одним записом, а не 5000 викликами enqueue:
    // enqueue перечитує і перезаписує все сховище щоразу, тож розгін до межі
    // коштував би O(n²) і робив тест повільним без користі. Перевіряємо межу.
    const full = Array.from({ length: QUEUE_LIMIT }, (_, i) => attempt(`e${i}`))
    storage.setItem(QUEUE_KEY, JSON.stringify(full))

    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    expect(q.size).toBe(QUEUE_LIMIT)

    for (let i = 0; i < 5; i++) q.enqueue(attempt(`new${i}`))

    expect(q.size, 'розмір не перевищує межу').toBe(QUEUE_LIMIT)
    const ids = q.peek().map((a) => a.client_id)
    expect(ids[0], 'найстаріші витіснені').toBe('e5')
    expect(ids.slice(-5), 'нові на місці').toEqual(['new0', 'new1', 'new2', 'new3', 'new4'])
  })

  it('пошкоджене сховище не ронить чергу', () => {
    const { send } = fakeSend()
    storage.setItem(QUEUE_KEY, 'не json')
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    expect(q.size).toBe(0)
    q.enqueue(attempt('a'))
    expect(q.size).toBe(1)
  })

  it('відкидає записи без client_id', () => {
    const { send } = fakeSend()
    storage.setItem(QUEUE_KEY, JSON.stringify([{ hand: 'AA' }, attempt('good'), null, 'сміття']))
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    expect(q.peek().map((a) => a.client_id)).toEqual(['good'])
  })
})

describe('відправка', () => {
  it('порожня черга нічого не шле', async () => {
    const { send, batches } = fakeSend()
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    expect(await q.flush()).toMatchObject({ status: 'empty', sent: 0 })
    expect(batches).toHaveLength(0)
  })

  it('успішна відправка спорожняє чергу', async () => {
    const { send, batches } = fakeSend()
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))
    q.enqueue(attempt('b'))

    const r = await q.flush()
    expect(r).toMatchObject({ status: 'ok', sent: 2, pending: 0 })
    expect(batches[0]?.map((a) => a.client_id)).toEqual(['a', 'b'])
    expect(q.size).toBe(0)
  })

  it('без логіну черга зберігається до кращих часів', async () => {
    const { send, batches } = fakeSend()
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => false, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))

    expect(await q.flush()).toMatchObject({ status: 'unauthenticated', pending: 1 })
    expect(batches).toHaveLength(0)
    expect(q.size).toBe(1)
  })

  it('офлайн не втрачає події', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { send, batches } = fakeSend()
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))

    expect(await q.flush()).toMatchObject({ status: 'offline', pending: 1 })
    expect(batches).toHaveLength(0)
    expect(q.size).toBe(1)
  })

  it('помилка сервера лишає події в черзі', async () => {
    const { send } = fakeSend({ error: 'мережа впала' })
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))

    const r = await q.flush()
    expect(r).toMatchObject({ status: 'error', sent: 0, pending: 1 })
    expect(r.error).toBe('мережа впала')
    expect(q.size).toBe(1)
  })

  it('великий батч ріжеться до ліміту, решта лишається', async () => {
    const { send, batches } = fakeSend()
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    for (let i = 0; i < BATCH_LIMIT + 25; i++) q.enqueue(attempt(`e${i}`))

    const r = await q.flush()
    expect(batches[0]).toHaveLength(BATCH_LIMIT)
    expect(r.pending).toBe(25)
  })

  it('події, додані під час відправки, не губляться', async () => {
    // Відправка навмисно зависає, доки тест не відпустить її вручну.
    let finish: (v: SendResult) => void = () => {}
    const send = (): Promise<SendResult> =>
      new Promise((res) => {
        finish = res
      })

    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))

    const flushing = q.flush()
    // Гравець відповів, поки запит ще летів.
    q.enqueue(attempt('b'))
    finish({ error: null })
    const r = await flushing

    expect(r.sent).toBe(1)
    expect(q.peek().map((x) => x.client_id)).toEqual(['b'])
  })

  it('паралельні виклики зливаються в один запит', async () => {
    const { send, batches } = fakeSend()
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))

    const [r1, r2, r3] = await Promise.all([q.flush(), q.flush(), q.flush()])
    expect(batches).toHaveLength(1)
    expect([r1, r2, r3].every((r) => r.status === 'ok')).toBe(true)
  })
})

describe('повтори з backoff', () => {
  it('після помилки наступна спроба відкладається', async () => {
    let now = 1_000_000
    const { send, batches } = fakeSend({ error: 'впало' })
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, now: () => now, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))

    await q.flush()
    expect(batches).toHaveLength(1)

    // Одразу після невдачі — не шлемо.
    await q.flush()
    expect(batches).toHaveLength(1)

    now += (BACKOFF_MS[0] ?? 0) + 1
    await q.flush()
    expect(batches).toHaveLength(2)
  })

  it('затримка росте з кожною невдачею', async () => {
    let now = 1_000_000
    const { send, batches } = fakeSend({ error: 'впало' })
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, now: () => now, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))

    await q.flush()
    now += (BACKOFF_MS[0] ?? 0) + 1
    await q.flush()
    expect(batches).toHaveLength(2)

    // Друга затримка більша за першу: перша пауза вже не звільняє відправку.
    now += (BACKOFF_MS[0] ?? 0) + 1
    await q.flush()
    expect(batches).toHaveLength(2)

    now += (BACKOFF_MS[1] ?? 0) + 1
    await q.flush()
    expect(batches).toHaveLength(3)
  })

  it('force ігнорує паузу — для ручного «спробувати зараз»', async () => {
    let now = 1_000_000
    const { send, batches } = fakeSend({ error: 'впало' })
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, now: () => now, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))

    await q.flush()
    await q.flush(true)
    expect(batches).toHaveLength(2)
    now += 0
  })

  it('успіх скидає лічильник невдач', async () => {
    let now = 1_000_000
    let failing = true
    const batches: unknown[][] = []
    const send = (batch: readonly QueuedAttempt[]): Promise<SendResult> => {
      batches.push([...batch])
      return Promise.resolve(failing ? { error: { message: 'впало' } } : { error: null })
    }

    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, now: () => now, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))
    await q.flush()

    failing = false
    now += (BACKOFF_MS[0] ?? 0) + 1
    await q.flush()

    // Після успіху нова подія їде без очікування.
    q.enqueue(attempt('b'))
    await q.flush()
    expect(batches).toHaveLength(3)
  })

  it('resetBackoff дозволяє відправку одразу після логіну', async () => {
    let now = 1_000_000
    const { send, batches } = fakeSend({ error: 'впало' })
    const q = new SyncQueue<QueuedAttempt>({ storage, isAuthenticated: () => true, now: () => now, storageKey: QUEUE_KEY, send })
    q.enqueue(attempt('a'))

    await q.flush()
    q.resetBackoff()
    await q.flush()
    expect(batches).toHaveLength(2)
  })
})
