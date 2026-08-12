/**
 * Генератор еталона постфлоп-ядра. Виконує evaluate/texture/decide з
 * poker-trainer.html над детерміновано згенерованими роздачами.
 *
 * Використання:
 *   node dump-postflop.mjs <ref-postflop-core.js> <out.json>
 *
 * Референс працює лише з трикартковим бордом, тому й еталон лише про флоп:
 * терн і рівер джерела в HTML не мають — вони описані спекою.
 */

import fs from 'node:fs'

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
const mod = new Function(core + '\nreturn {RANKS,VAL,SUITS,evaluate,texture,decide};')()
const { RANKS, VAL, SUITS, evaluate, texture, decide } = mod

const deck = []
for (const rk of RANKS) SUITS.forEach((s, si) => deck.push({ rk, v: VAL[rk], s: si, g: s.g, red: s.red }))

const code = (c) => c.rk + ['s', 'h', 'd', 'c'][c.s]

const out = []
const rng = mulberry32(20260812)
for (let i = 0; i < 4000; i++) {
  const pool = [...deck]
  const take = () => pool.splice(Math.floor(rng() * pool.length), 1)[0]
  const hole = [take(), take()]
  const board = [take(), take(), take()]
  const ev = evaluate(hole, board)
  const tx = texture(board)
  const nOpp = 1 + Math.floor(rng() * 3)
  const ip = rng() < 0.5
  out.push({
    hole: hole.map(code),
    board: board.map(code),
    cat: ev.cat,
    label: ev.label,
    tex: tx.t,
    texLabel: tx.label,
    nOpp,
    ip,
    decide: decide(ev.cat, tx.t, nOpp, ip),
  })
}

fs.writeFileSync(process.argv[3], JSON.stringify(out))
console.log(`${out.length} кейсів → ${process.argv[3]}`)
