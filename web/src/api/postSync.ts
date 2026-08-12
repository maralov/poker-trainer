/**
 * Заглушка синку постфлопу (Етап 2).
 *
 * Форма QueuedPostAttempt фіксує майбутню схему таблиці `postflop_attempts`
 * (спека §8) уже зараз, щоб стор і схема бази не розійшлись до того, як у
 * post-3 з'явиться справжня черга — за зразком api/syncQueue.ts: localStorage,
 * батчі, бекоф, ідемпотентність через client_id. Поки що тренування Етапу 2
 * пише лише в локальний прогрес (store/progressStore.ts), мережа йому не
 * потрібна (правило 6 CLAUDE.md).
 */

export interface QueuedPostAttempt {
  readonly client_id: string
  /** Ідентифікатор роздачі: кілька рядків цієї події можуть належати одній роздачі. */
  readonly episode_id: string
  readonly line: string
  readonly scenario: string
  readonly hero_pos: string
  /** Позиції опонентів через кому. */
  readonly opp_pos: string
  readonly n_opps: number
  readonly ip: boolean
  readonly street: string
  readonly board: string
  readonly hand: string
  readonly hole: string
  readonly category: string
  readonly texture: string
  readonly facing: string
  readonly repeat_aggro: boolean
  readonly pot_bb: number
  readonly chosen: string
  readonly correct: string
  readonly answered_at: string
}

/** post-3 замінить справжньою чергою; поки що подія нікуди не йде. */
export function recordPostAttempt(_attempt: QueuedPostAttempt): void {
  // Навмисно порожньо.
}
