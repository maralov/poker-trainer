/**
 * Черга синхронізації спроб.
 *
 * Тренування має працювати без мережі: кожна відповідь спершу лягає в чергу
 * в localStorage, і лише потім їде на сервер батчами. Втрата мережі, відсутній
 * логін чи помилка сервера нічого не ламають — черга просто накопичується.
 *
 * Ідемпотентність: кожна подія несе client_id (uuid), а в базі стоїть
 * unique (user_id, client_id). Повторно надісланий батч не створює дублів,
 * тому «надіслати ще раз» — завжди безпечна операція.
 *
 * Модуль не імпортує React: логіка черги тестується без рендера.
 */

import type { AttemptInsert } from './supabase'

export const QUEUE_KEY = 'poker_trainer_sync_queue_v1'
/** Постфлоп має власну чергу: етапи не мають блокувати один одного. */
export const POST_QUEUE_KEY = 'poker_trainer_post_sync_queue_v1'

/** Скільки подій накопичити, перш ніж слати не чекаючи таймера. */
export const FLUSH_AT = 10
/** Періодичний флаш, мс. */
export const FLUSH_INTERVAL_MS = 30_000
/** Ліміт рядків в одному запиті. */
export const BATCH_LIMIT = 500
/** Скільки подій тримаємо максимум: далі відкидаємо найстаріші. */
export const QUEUE_LIMIT = 5000
/** Затримки повторів, мс. Після останньої — далі та сама пауза. */
export const BACKOFF_MS = [1_000, 5_000, 15_000, 60_000, 300_000] as const

export type QueuedAttempt = AttemptInsert & { client_id: string }

export interface QueueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Те, що повертає відправка. Форма збігається з відповіддю supabase-js. */
export interface SendResult {
  readonly error: { readonly message: string } | null
}

export interface SyncDeps<T extends { client_id: string }> {
  storage: QueueStorage
  /** Чи є зараз авторизований користувач. Без нього слати нікуди. */
  isAuthenticated: () => boolean
  now?: () => number
  /** Ключ у localStorage: у кожної черги свій. */
  storageKey: string
  /**
   * Відправка батча — єдине місце, яке знає про таблицю. Черга параметризована
   * саме нею, а не назвою таблиці: так вона лишається чистою (не тягне
   * supabase) і тестується без підробленого клієнта бази.
   */
  send: (batch: readonly T[]) => Promise<SendResult>
}

export interface FlushResult {
  /** Скільки подій прийняв сервер (включно з дублями, які він тихо пропустив). */
  readonly sent: number
  /** Скільки лишилось у черзі. */
  readonly pending: number
  readonly status: 'ok' | 'empty' | 'unauthenticated' | 'offline' | 'error'
  readonly error?: string
}

function readQueue<T extends { client_id: string }>(storage: QueueStorage, key: string): T[] {
  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Пошкоджений запис не має ронити тренування — просто відкидаємо його.
    return parsed.filter(
      (e): e is T =>
        typeof e === 'object' && e !== null && typeof (e as T).client_id === 'string',
    )
  } catch {
    return []
  }
}

function writeQueue<T extends { client_id: string }>(
  storage: QueueStorage,
  key: string,
  items: readonly T[],
): void {
  try {
    storage.setItem(key, JSON.stringify(items))
  } catch {
    // Переповнене або недоступне сховище: краще втратити чергу, ніж застосунок.
  }
}

export class SyncQueue<T extends { client_id: string } = QueuedAttempt> {
  private readonly deps: SyncDeps<T>
  private failures = 0
  private nextAttemptAt = 0
  private inFlight: Promise<FlushResult> | null = null

  constructor(deps: SyncDeps<T>) {
    this.deps = deps
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private read(): T[] {
    return readQueue<T>(this.deps.storage, this.deps.storageKey)
  }

  private write(items: readonly T[]): void {
    writeQueue(this.deps.storage, this.deps.storageKey, items)
  }

  get size(): number {
    return this.read().length
  }

  peek(): T[] {
    return this.read()
  }

  /** Кладе подію в чергу. Повертає true, якщо варто спробувати відправку зараз. */
  enqueue(attempt: T): boolean {
    const queue = this.read()
    queue.push(attempt)
    // Черга не має рости безмежно, якщо синк не працює тижнями.
    if (queue.length > QUEUE_LIMIT) queue.splice(0, queue.length - QUEUE_LIMIT)
    this.write(queue)
    return queue.length >= FLUSH_AT
  }

  /**
   * Відправляє накопичене. Безпечно викликати як завгодно часто:
   * паралельні виклики зливаються в один запит.
   */
  flush(force = false): Promise<FlushResult> {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.doFlush(force).finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async doFlush(force: boolean): Promise<FlushResult> {
    const queue = this.read()
    if (!queue.length) return { sent: 0, pending: 0, status: 'empty' }

    if (!this.deps.isAuthenticated()) {
      return { sent: 0, pending: queue.length, status: 'unauthenticated' }
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { sent: 0, pending: queue.length, status: 'offline' }
    }
    if (!force && this.now() < this.nextAttemptAt) {
      return { sent: 0, pending: queue.length, status: 'error', error: 'очікування повтору' }
    }

    const batch = queue.slice(0, BATCH_LIMIT)
    // Повторна відправка того самого батча нічого не дублює: за це відповідає
    // unique (user_id, client_id) у базі плюс ignoreDuplicates у самій send.
    const { error } = await this.deps.send(batch)

    if (error) {
      this.failures++
      const delay = BACKOFF_MS[Math.min(this.failures - 1, BACKOFF_MS.length - 1)] ?? 0
      this.nextAttemptAt = this.now() + delay
      return { sent: 0, pending: queue.length, status: 'error', error: error.message }
    }

    this.failures = 0
    this.nextAttemptAt = 0

    // Перечитуємо: поки летів запит, тренування могло дописати нові події.
    const current = this.read()
    const sentIds = new Set(batch.map((a) => a.client_id))
    const rest = current.filter((a) => !sentIds.has(a.client_id))
    this.write(rest)

    return { sent: batch.length, pending: rest.length, status: 'ok' }
  }

  /** Скидає лічильник повторів — наприклад, після успішного логіну. */
  resetBackoff(): void {
    this.failures = 0
    this.nextAttemptAt = 0
  }

  clear(): void {
    this.write([])
  }
}
