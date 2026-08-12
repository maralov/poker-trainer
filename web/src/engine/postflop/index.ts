/**
 * Публічний API постфлопу (Етап 2).
 *
 * Ті самі правила, що й у решті engine/: жодного React, zustand, DOM чи
 * supabase; уся випадковість — через інжектований Rng.
 *
 * Джерела істини: флоп-ядро — poker-trainer.html (звірене фікстурами),
 * решта — docs/superpowers/specs/2026-08-11-postflop-stage-design.md.
 */

export * from './build'
export * from './deck'
export * from './episode'
export * from './evaluate'
export * from './matrixBet'
export * from './matrixDefend'
export * from './postProgress'
export * from './showdown'
export * from './step'
export * from './types'
export * from './villain'
