/**
 * Одноразове перенесення локальної історії на сервер після першого входу.
 *
 * Чесне обмеження: перенести можна лише ПОМИЛКИ. Standalone-версія зберігала
 * повний запис (рука, позиція, вибір) тільки для них; правильні відповіді
 * лягали в лічильники total/correct без деталей, а `recent` не містить руки —
 * а вона в базі обовʼязкова. Вигадувати руку заради красивого числа означало б
 * зіпсувати всю подальшу статистику, тому переносимо тільки те, що є насправді.
 *
 * client_id детермінований: повторний запуск міграції не створює дублів
 * завдяки unique (user_id, client_id).
 */

import type { MistakeEntry, PreProgress } from '../engine/progress'
import { recordAttempt } from './sync'
import type { QueuedAttempt } from './syncQueue'

export const MIGRATION_FLAG_KEY = 'poker_trainer_local_migrated_v1'

/** Стабільний ключ події: ті самі дані завжди дають той самий client_id. */
export function legacyClientId(e: MistakeEntry): string {
  return `legacy:${e.t}:${e.s}:${e.p}:${e.h}:${e.ch}`
}

export function toAttempt(e: MistakeEntry): QueuedAttempt {
  return {
    client_id: legacyClientId(e),
    stage: 'pre',
    scenario: e.s,
    hero_pos: e.p,
    hand: e.h,
    // Контексту опонента у старому форматі не було — залишаємо порожнім,
    // замість того щоб вигадувати.
    villain_pos: null,
    limpers: null,
    chosen: e.ch,
    correct: e.co,
    is_drill: false,
    is_control: false,
    answered_at: new Date(e.t).toISOString(),
  } as QueuedAttempt
}

export interface MigrationResult {
  readonly migrated: number
  readonly skipped: 'already-done' | 'nothing-to-do' | null
}

/**
 * Кладе локальні помилки в чергу синку. Повторний виклик нічого не робить:
 * і прапорець у сховищі, і детермінований client_id захищають від дублів.
 */
export function migrateLocalHistory(
  progress: PreProgress,
  storage: Storage | undefined = globalThis.localStorage,
): MigrationResult {
  try {
    if (storage?.getItem(MIGRATION_FLAG_KEY)) return { migrated: 0, skipped: 'already-done' }
  } catch {
    // Недоступне сховище — краще спробувати перенести ще раз, ніж не перенести:
    // дублів усе одно не буде.
  }

  const entries = progress.log
  if (!entries.length) {
    try {
      storage?.setItem(MIGRATION_FLAG_KEY, String(Date.now()))
    } catch {
      /* нічого не вдієш */
    }
    return { migrated: 0, skipped: 'nothing-to-do' }
  }

  for (const e of entries) recordAttempt(toAttempt(e))

  try {
    storage?.setItem(MIGRATION_FLAG_KEY, String(Date.now()))
  } catch {
    /* нічого не вдієш */
  }

  return { migrated: entries.length, skipped: null }
}
