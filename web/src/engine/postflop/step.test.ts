import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../test/rng'
import { handOf } from '../cards'
import { BUILD } from './build'
import { cardCode } from './deck'
import { evalHand } from './evaluate'
import { advance, answerPost, heroDecision, startEpisode } from './step'
import type { PostAction } from './types'

/** Прогонить епізод до кінця, щоразу віддаючи правильну відповідь. */
function playCorrect(seed: number): ReturnType<typeof startEpisode> {
  const ep = startEpisode({ rng: mulberry32(seed) })
  const rng = mulberry32(seed + 10_000)
  let guard = 0
  while (!ep.finished && guard++ < 20) {
    const d = heroDecision(ep)
    if (!d) break
    answerPost(ep, d.correct, rng)
  }
  return ep
}

/** Прогонить епізод, щоразу віддаючи задану дію, якщо вона доступна. */
function playWith(seed: number, prefer: PostAction): ReturnType<typeof startEpisode> {
  const ep = startEpisode({ rng: mulberry32(seed) })
  const rng = mulberry32(seed + 10_000)
  let guard = 0
  while (!ep.finished && guard++ < 20) {
    const d = heroDecision(ep)
    if (!d) break
    const has = d.options.some((o) => o.k === prefer)
    answerPost(ep, has ? prefer : (d.options[0]?.k ?? 'check'), rng)
  }
  return ep
}

describe('startEpisode', () => {
  it('той самий seed дає той самий стан і те саме рішення', () => {
    const a = startEpisode({ rng: mulberry32(5) })
    const b = startEpisode({ rng: mulberry32(5) })
    expect(a.board.map(cardCode)).toEqual(b.board.map(cardCode))
    expect(heroDecision(a)?.correct).toBe(heroDecision(b)?.correct)
  })

  it('герой або має рішення, або роздача вже завершена', () => {
    for (let s = 1; s <= 200; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      expect(ep.finished !== null || heroDecision(ep) !== null, `seed ${s}`).toBe(true)
    }
  })

  it('на флопі без ставок пропонує чек і два сайзи в порядку хоткеїв', () => {
    for (let s = 1; s <= 100; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const d = heroDecision(ep)
      if (!d || d.facing !== 'none') continue
      expect(d.options.map((o) => o.k)).toEqual(['check', 'b33', 'b66'])
      expect(d.options[1]?.l).toMatch(/33% · [\d.]+bb/)
      return
    }
    throw new Error('не трапився спот без ставки — перевір генератор')
  })
})

describe('дії героя', () => {
  it('фолд завершує роздачу', () => {
    const ep = startEpisode({ rng: mulberry32(3) })
    answerPost(ep, 'fold', mulberry32(3))
    expect(ep.finished?.kind).toBe('hero-folded')
    expect(ep.finished?.heroWon).toBe(false)
    expect(heroDecision(ep)).toBeNull()
  })

  it('ставка збільшує банк і зменшує стек героя', () => {
    for (let s = 1; s <= 100; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const d = heroDecision(ep)
      if (!d || d.facing !== 'none') continue
      const potBefore = ep.potBB
      const stackBefore = ep.seats[ep.heroIdx]?.stack ?? 0
      answerPost(ep, 'b66', mulberry32(s + 1))
      expect(ep.potBB).toBeGreaterThan(potBefore)
      expect(ep.seats[ep.heroIdx]?.stack).toBeLessThan(stackBefore)
      return
    }
    throw new Error('не трапився спот без ставки')
  })

  it('правильна відповідь дає ok, неправильна — ні', () => {
    const ep = startEpisode({ rng: mulberry32(9) })
    const d = heroDecision(ep)
    expect(d).not.toBeNull()
    const wrong = d!.options.map((o) => o.k).find((k) => k !== d!.correct)
    expect(wrong).toBeDefined()
    const res = answerPost(ep, wrong!, mulberry32(9))
    expect(res.ok).toBe(false)
    expect(res.decision.correct).toBe(d!.correct)
  })

  it('відповідь після завершення роздачі — виняток, а не мовчазний no-op', () => {
    const ep = startEpisode({ rng: mulberry32(4) })
    answerPost(ep, 'fold', mulberry32(4))
    expect(() => answerPost(ep, 'check', mulberry32(4))).toThrow(/не треба діяти/)
  })
})

describe('перебіг роздачі', () => {
  it('роздача завжди доходить до термінала', () => {
    for (let s = 1; s <= 300; s++) {
      const ep = playCorrect(s)
      expect(ep.finished, `seed ${s}`).not.toBeNull()
      expect(['hero-folded', 'villains-folded', 'showdown']).toContain(ep.finished?.kind)
    }
  })

  it('борд росте рівно до пʼяти карт і ніколи не повторює карту', () => {
    for (let s = 1; s <= 200; s++) {
      const ep = playCorrect(s)
      expect(ep.board.length).toBeGreaterThanOrEqual(3)
      expect(ep.board.length).toBeLessThanOrEqual(5)
      const all = [...ep.board, ...ep.seats.flatMap((x) => [...x.hole])].map(cardCode)
      expect(new Set(all).size, `seed ${s}`).toBe(all.length)
    }
  })

  it('шоудаун показує карти всіх, хто дійшов, і має переможця', () => {
    let seen = 0
    for (let s = 1; s <= 300 && seen < 5; s++) {
      const ep = playCorrect(s)
      if (ep.finished?.kind !== 'showdown') continue
      seen++
      expect(ep.board).toHaveLength(5)
      expect(ep.finished.shown.length).toBeGreaterThanOrEqual(2)
      expect(ep.finished.shown.some((h) => h.won)).toBe(true)
      for (const h of ep.finished.shown) expect(h.label.length).toBeGreaterThan(0)
    }
    expect(seen, 'шоудауни мають траплятись').toBeGreaterThan(0)
  })

  it('стеки не йдуть у мінус, банк не перевищує всіх внесків', () => {
    for (let s = 1; s <= 200; s++) {
      const ep = playWith(s, 'b66')
      for (const seat of ep.seats) expect(seat.stack, `seed ${s}`).toBeGreaterThanOrEqual(0)
      const putIn = ep.seats.reduce((sum, x) => sum + (BUILD.startStack - x.stack), 0)
      expect(ep.potBB).toBeLessThanOrEqual(putIn + 1.5)
    }
  })

  it('нова вулиця скидає cap рейзу', () => {
    for (let s = 1; s <= 200; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const rng = mulberry32(s + 5)
      let guard = 0
      let street = ep.street
      while (!ep.finished && guard++ < 20) {
        const d = heroDecision(ep)
        if (!d) break
        if (d.street !== street) {
          street = d.street
          expect(ep.raised, `seed ${s}: нова вулиця має скидати cap`).toBe(false)
        }
        answerPost(ep, d.correct, rng)
      }
    }
  })

  it('проти рейзу кнопки рейзу немає — ре-рейзів у моделі не існує', () => {
    let seen = 0
    for (let s = 1; s <= 400 && seen < 3; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const rng = mulberry32(s + 77)
      let guard = 0
      while (!ep.finished && guard++ < 20) {
        const d = heroDecision(ep)
        if (!d) break
        if (d.facing === 'raise') {
          seen++
          expect(d.options.map((o) => o.k)).toEqual(['fold', 'call'])
          break
        }
        answerPost(ep, d.options.some((o) => o.k === 'b66') ? 'b66' : d.correct, rng)
      }
    }
    expect(seen, 'рейзи опонентів мають траплятись').toBeGreaterThan(0)
  })

  it('стрічка історії поповнюється і починається з префлопу', () => {
    const ep = playCorrect(12)
    expect(ep.history[0]).toMatch(/відкрив|ізо-рейз/)
    expect(ep.history.length).toBeGreaterThan(1)
  })
})

describe('HeroDecision несе знімок споту для журналу', () => {
  it('board, hole і hand у рішенні відповідають фактичному стану на момент рішення', () => {
    const ep = startEpisode({ rng: mulberry32(5) })
    const d = heroDecision(ep)
    expect(d).not.toBeNull()
    const hero = ep.seats[ep.heroIdx]
    expect(hero).toBeDefined()
    expect(d!.board.map(cardCode)).toEqual(ep.board.map(cardCode))
    expect(d!.hole.map(cardCode)).toEqual(hero!.hole.map(cardCode))
    expect(d!.hand).toBe(handOf(hero!.hole))
  })

  // Регресія на дефект: answerPost() викликає advance() ПЕРЕД return, тож
  // ep.board на момент, коли викликач читає результат, уже міг вирости на
  // карту наступної вулиці. Якщо decision.board — жива посилання на той самий
  // мутований масив, а не копія, журнал записав би вулицю, якої герой ще не
  // бачив, коли приймав рішення.
  it('знімок борду в рішенні не мутується, коли advance() дописує карту наступної вулиці', () => {
    let seen = false
    for (let s = 1; s <= 500 && !seen; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const rng = mulberry32(s + 900)
      let guard = 0
      while (!ep.finished && guard++ < 20) {
        const d = heroDecision(ep)
        if (!d) break
        const boardBefore = d.board.map(cardCode)
        answerPost(ep, d.correct, rng)
        if (ep.board.length > boardBefore.length) {
          expect(d.board.map(cardCode), `seed ${s}`).toEqual(boardBefore)
          seen = true
          break
        }
      }
    }
    expect(seen, 'мав трапитись перехід на нову вулицю в межах однієї відповіді').toBe(true)
  })

  it('oppPositions лишається повним списком опонентів роздачі, навіть коли хтось встиг зафолдити', () => {
    let seen = false
    for (let s = 1; s <= 500 && !seen; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const dealt = ep.seats.filter((x) => !x.hero).map((x) => x.pos)
      if (dealt.length < 2) continue
      const rng = mulberry32(s + 321)
      let guard = 0
      while (!ep.finished && guard++ < 20) {
        const d = heroDecision(ep)
        if (!d) break
        expect(d.oppPositions, `seed ${s}`).toEqual(dealt)
        if (d.nOpps < d.oppPositions.length) seen = true
        answerPost(ep, d.correct, rng)
      }
    }
    expect(seen, 'мав трапитись фолд опонента до рішення героя в мультиполі').toBe(true)
  })
})

describe('ризик 1 — порядок дій після рейзу не губить учасників', () => {
  it('на кожній вулиці facing==="raise" трапляється щонайбільше раз (rerise неможливий, а cap не «губиться»)', () => {
    let seenRaiseFacing = 0
    for (let s = 1; s <= 400 && seenRaiseFacing < 5; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const rng = mulberry32(s + 91)
      let guard = 0
      let raisesThisStreet = 0
      let street = ep.street
      while (!ep.finished && guard++ < 20) {
        const d = heroDecision(ep)
        if (!d) break
        if (d.street !== street) {
          street = d.street
          raisesThisStreet = 0
        }
        if (d.facing === 'raise') {
          raisesThisStreet++
          seenRaiseFacing++
          expect(raisesThisStreet, `seed ${s}`).toBe(1)
        }
        answerPost(ep, d.correct, rng)
      }
    }
    expect(seenRaiseFacing).toBeGreaterThan(0)
  })

  it('нескінченний цикл неможливий: guard у advance() не потрібен на жодному з 500 seed-ів', () => {
    // Непряма перевірка: якщо guard колись рятує ситуацію, роздача або
    // зависає (finished лишається null при вичерпаному "ходовому бюджеті"
    // ззовні), або обривається за 20 кроків playCorrect. Beреться великий
    // діапазон seed-ів навмисно — сюди ж потрапляють і мультивей-роздачі.
    for (let s = 1; s <= 500; s++) {
      const ep = playCorrect(s)
      expect(ep.finished, `seed ${s}`).not.toBeNull()
    }
  })
})

describe('ризик 3 — олл-ін', () => {
  it('опонент із мізерним стеком іде ва-банк, і роздача все одно доходить до термінала', () => {
    let done = false
    for (let s = 1; s <= 300 && !done; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const d = heroDecision(ep)
      if (!d || d.facing !== 'none') continue
      const villainIdx = ep.seats.findIndex((seat) => !seat.hero)
      const villain = ep.seats[villainIdx]
      if (!villain) continue
      villain.stack = 0.5 // майже нічого не лишилось — колл чи рейз стане олл-іном
      const rng = mulberry32(s + 500)
      answerPost(ep, 'b66', rng)
      let guard = 0
      while (!ep.finished && guard++ < 20) {
        const dd = heroDecision(ep)
        if (!dd) break
        answerPost(ep, dd.correct, rng)
      }
      expect(ep.finished, `seed ${s}`).not.toBeNull()
      for (const seat of ep.seats) expect(seat.stack, `seed ${s}`).toBeGreaterThanOrEqual(0)
      done = true
    }
    expect(done, 'має знайтись спот без ставки, щоб зробити опонента коротким').toBe(true)
  })

  it('рейз опонента, на який стека вистачає лише частково, не занижує ep.bet нижче того, що вже стоїть на кону', () => {
    let done = false
    for (let s = 1; s <= 400 && !done; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      // Спрощуємо до хедз-апу: лише герой і один опонент, і опонент діє
      // РАНІШЕ за героя — тоді після його дії черга одразу повертається
      // герою в межах ТІЄЇ Ж вулиці (вулиця не встигає закритись і
      // обнулити ep.bet, тож є що перевірити).
      if (ep.seats.length !== 2 || ep.heroIdx !== 1) continue
      const villain = ep.seats[0]
      const hero = ep.seats[1]
      if (!villain || !hero) continue
      // Потрібна ненульова частота рейзу в матриці опонента (§6 villain.ts):
      // MEDIUM/WEAK/WEAKDRAW завжди мають raise=[0,0], там форс не спрацює.
      const { cat } = evalHand(villain.hole, ep.board)
      if (cat === 'MEDIUM' || cat === 'WEAK' || cat === 'WEAKDRAW') continue

      ep.bet = 10
      hero.put = 0
      villain.put = 0
      villain.stack = 2 // на повний рейз (30bb) не вистачить навіть на колл
      ep.acted = new Set<number>()
      ep.raised = false
      ep.streetHadBet = true

      // roll=0 обирає рейз, щойно частота рейзу для цієї категорії ненульова.
      advance(ep, () => 0)

      // Вулиця не мала закритись: опонент після олл-іну більше не потребує
      // дії (стек=0), а герой ще не відповів на існуючу ставку 10bb.
      expect(ep.finished, `seed ${s}`).toBeNull()
      expect(heroDecision(ep), `seed ${s}`).not.toBeNull()
      expect(ep.bet, `seed ${s}: ставка не має занижуватись олл-іном менше за неї`).toBeGreaterThanOrEqual(10)
      expect(villain.stack, `seed ${s}`).toBeGreaterThanOrEqual(0)
      done = true
    }
    expect(done, 'має знайтись хедз-ап спот з опонентом до героя і ненульовою частотою рейзу').toBe(true)
  })
})

describe('ризик 4 — facing "raise" у мультиполі', () => {
  it('якщо рейз стався до першого погляду героя на вулицю (put героя ще 0), facing все одно "raise"', () => {
    let seen = 0
    for (let s = 1; s <= 2000 && seen < 3; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const rng = mulberry32(s + 123)
      let guard = 0
      while (!ep.finished && guard++ < 20) {
        const d = heroDecision(ep)
        if (!d) break
        const heroPut = ep.seats[ep.heroIdx]?.put ?? 0
        if (d.facing !== 'none' && heroPut === 0 && ep.raised) {
          seen++
          expect(d.facing, `seed ${s}: hero.put=0 але ep.raised=true`).toBe('raise')
          expect(d.options.map((o) => o.k)).toEqual(['fold', 'call'])
        }
        answerPost(ep, d.correct, rng)
      }
    }
    expect(seen, 'сценарій «рейз до першого погляду героя» має траплятись').toBeGreaterThan(0)
  })
})

describe('ризик 5 — delayed', () => {
  it('на флопі delayed завжди false', () => {
    for (let s = 1; s <= 100; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      if (ep.street === 'flop') expect(ep.delayed, `seed ${s}`).toBe(false)
    }
  })

  it('чек-чек на флопі — delayed=true на терні; ставка на флопі — delayed=false на терні', () => {
    let sawDelayed = false
    let sawNotDelayed = false
    for (let s = 1; s <= 400 && (!sawDelayed || !sawNotDelayed); s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const rng = mulberry32(s + 44)
      let guard = 0
      let flopHadBet = false
      while (!ep.finished && guard++ < 20) {
        const d = heroDecision(ep)
        if (!d) break
        if (d.street === 'flop' && d.facing !== 'none') flopHadBet = true
        if (d.street === 'flop' && d.facing === 'none' && d.correct !== 'check') flopHadBet = true
        if (d.street === 'turn') {
          if (flopHadBet) {
            sawNotDelayed = true
            expect(ep.delayed, `seed ${s}: флоп мав ставку`).toBe(false)
          } else {
            sawDelayed = true
            expect(ep.delayed, `seed ${s}: флоп пройшов чек-чек`).toBe(true)
          }
          break
        }
        answerPost(ep, d.correct, rng)
      }
    }
    expect(sawDelayed, 'мав траплятись чек-чек флоп → delayed на терні').toBe(true)
    expect(sawNotDelayed, 'мала траплятись ставка на флопі → not delayed на терні').toBe(true)
  })
})
