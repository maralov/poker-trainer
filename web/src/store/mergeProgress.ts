/**
 * Зведення серверного прогресу з тим, що ще не доїхало.
 *
 * Сервер знає історію з усіх пристроїв, але завжди трохи відстає: остання
 * відповідь ще лежить у черзі. Якщо показувати лише серверні цифри, лічильник
 * після відповіді не поворухнеться до наступного синку — виглядало б як баг.
 * Тому показуємо серверний прогрес, поверх якого програні події з черги.
 *
 * Стан drill береться локальний: серії по руках («5 правильних поспіль») і вікно
 * точності drill на сервері не зберігаються, бо RPC віддає лише помилки —
 * вивести з них серії правильних відповідей неможливо.
 */

import type { QueuedAttempt } from '../api/syncQueue'
import { recordAnswer, type PreProgress } from '../engine/progress'
import type { Action, Position, Scenario } from '../engine/types'

/**
 * @param server прогрес, зібраний з серверних агрегацій
 * @param localDrill локальний стан drill (серії по руках і вікно точності)
 * @param queued спроби, які ще не вивантажені
 */
export function mergeProgress(
  server: PreProgress,
  localDrill: PreProgress['drill'],
  queued: readonly QueuedAttempt[],
): PreProgress {
  const merged = structuredClone(server)
  merged.drill = structuredClone(localDrill)

  // Найдовша серія на сервері порахована по всій історії; продовжити її точно
  // не можна, бо невідомо, чим вона закінчилась. Тому серію рахуємо з нуля,
  // а рекорд лишаємо не нижчим за серверний — він від цього не зменшиться.
  let streak = 0
  for (const a of queued) {
    if (a.stage && a.stage !== 'pre') continue
    const result = recordAnswer(merged, streak, {
      scen: a.scenario as Scenario,
      heroPos: a.hero_pos as Position,
      hand: a.hand,
      chosen: a.chosen as Action,
      correct: a.correct as Action,
      drill: a.is_drill ?? false,
      isControl: a.is_control ?? false,
      at: Date.parse(a.answered_at),
    })
    streak = result.streak
  }
  merged.best = Math.max(server.best, merged.best)

  return merged
}
