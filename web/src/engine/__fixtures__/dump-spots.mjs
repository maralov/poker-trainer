/**
 * Генератор еталонних спотів. Виконує preBuildSpot з poker-trainer.html
 * під детермінованим Math.random і серіалізує результат.
 *
 * Використання:
 *   node dump-spots.mjs <ref-spots-core.js> <out.json>
 *
 * Порядок звернень до rng у порту має збігатися з референсом — саме це
 * і перевіряє spots.test.ts, звіряючись із цим файлом.
 */
import fs from 'node:fs'

/** mulberry32 — той самий генератор має бути в тестах порту. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const core = fs.readFileSync(process.argv[2], 'utf8')
// preBuildSpot читає DB.pre.missed — підставляємо порожній стан.
const factory = new Function(
  'DB',
  'activeScenarios',
  core + '\nreturn preBuildSpot;',
)

/**
 * FNV-1a по відсортованому складу набору. Повні списки рук у кожному споті
 * роздули б фікстуру до ~1 МБ, а сам склад діапазонів уже перевіряє ranges.test.ts
 * проти ref-truth.json. Тут достатньо впевнитись, що обрано ТОЙ САМИЙ набір.
 */
function sig(set) {
  const s = [...set].sort().join(',')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const serialize = (q) => ({
  scen: q.scen,
  heroPos: q.heroPos,
  seats: q.seats,
  prompt: q.prompt,
  potBB: q.potBB,
  correct: q.correct,
  hand: q.hand,
  cards: q.cards.map((c) => ({ rk: c.rk, v: c.v, s: c.s, g: c.g, red: c.red })),
  explainExtra: q.explainExtra,
  isControl: q.isControl,
  raiseSize: q.ranges.raise.size,
  callSize: q.ranges.call.size,
  raiseSig: sig(q.ranges.raise),
  callSig: sig(q.ranges.call),
})

const SCENARIOS = ['rfi', 'iso', 'vsraise', 'vs3bet']
const N = 60
const out = { random: {}, forced: {}, control: {} }

for (const scen of SCENARIOS) {
  const DB = { pre: { missed: {} } }
  const build = factory(DB, new Set([scen]))

  out.random[scen] = []
  for (let seed = 1; seed <= N; seed++) {
    Math.random = mulberry32(seed)
    out.random[scen].push(serialize(build()))
  }

  // Forced: drill відтворює конкретну руку з конкретної позиції.
  const positions =
    scen === 'rfi'
      ? ['UTG', 'MP', 'CO', 'BTN', 'SB']
      : scen === 'vs3bet'
        ? ['UTG', 'MP', 'CO', 'BTN']
        : ['UTG+1', 'MP', 'CO', 'BTN', 'SB', 'BB']
  const hands = ['AA', 'AKs', 'KQo', 'T9s', '72o', '55', 'A5s', 'JTo']
  out.forced[scen] = []
  let seed = 1
  for (const heroPos of positions) {
    for (const hand of hands) {
      Math.random = mulberry32(seed++)
      out.forced[scen].push({
        input: { heroPos, hand },
        spot: serialize(build({ scen, heroPos, hand })),
      })
    }
  }

  // Control: та сама позиція, але рука поза списком ban.
  out.control[scen] = []
  seed = 500
  for (const heroPos of positions) {
    for (const ban of [['AA'], ['AA', 'AKs', 'KQo'], []]) {
      Math.random = mulberry32(seed++)
      out.control[scen].push({
        input: { heroPos, ban },
        spot: serialize(build({ scen, heroPos, hand: null, ban })),
      })
    }
  }
}

fs.writeFileSync(process.argv[3], JSON.stringify(out))
console.log(
  'random:',
  SCENARIOS.map((s) => `${s}=${out.random[s].length}`).join(' '),
  '| forced:',
  SCENARIOS.map((s) => `${s}=${out.forced[s].length}`).join(' '),
  '| control:',
  SCENARIOS.map((s) => `${s}=${out.control[s].length}`).join(' '),
)
