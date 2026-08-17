/**
 * Редюсер роздачі: опоненти діють самі, герой зупиняє машину на кожному
 * власному рішенні.
 *
 * Оцінка завжди йде від ФАКТИЧНОЇ лінії: якщо герой помилився на флопі, терн
 * оцінюється в контексті того, як роздача склалась, а не як «мало бути».
 */

import { handOf } from '../cards'
import { POSTFLOP_ORDER, type Card, type Position, type Rng } from '../types'
import { buildEpisode, type BuildOptions } from './build'
import { boardCode, drawCards } from './deck'
import type { EpisodeEnd, EpisodeState } from './episode'
import { boardEvents, evalHand } from './evaluate'
import { decideBet } from './matrixBet'
import { decideDefend } from './matrixDefend'
import { RANK_LABEL, rank7, showdownWinners } from './showdown'
import {
  STREET_LABEL,
  type BoardEvents,
  type Facing,
  type PostAction,
  type PostCategory,
  type PostLine,
  type Street,
  type Texture,
} from './types'
import { villainBetFraction, villainCbet, villainDonk, villainOpen, villainVsBet } from './villain'

/** Ціна вище цієї частки банку вважається великою (спека §5). */
const BIG_PRICE = 0.4
/** Рейз — завжди втричі від ставки (спека §3.2). */
const RAISE_FACTOR = 3

/** Заокруглення до 0.5bb — як у референсі. */
const r = (x: number): number => Math.round(x * 2) / 2

export interface PostActionOption {
  readonly k: PostAction
  readonly l: string
  readonly c: 'primary' | 'mid' | 'soft' | 'ghost'
}

export interface HeroDecision {
  readonly street: Street
  /** Роль героя в роздачі: від неї залежать §5.1а і §5.4. */
  readonly line: PostLine
  readonly facing: Facing
  readonly cat: PostCategory
  readonly label: string
  readonly texture: Texture
  readonly events: BoardEvents
  /** Скільки опонентів ще активні (не зафолдили) на момент цього рішення. */
  readonly nOpps: number
  /**
   * Позиції ВСІХ опонентів роздачі — включно з тими, хто вже зафолдив. Не
   * плутати з nOpps: після першого фолду в мультиполі вони розходяться, а
   * `opp_pos` у схемі журналу (спека §8) описує роздачу цілком, а не
   * миттєвий стан рішення.
   */
  readonly oppPositions: readonly Position[]
  readonly ip: boolean
  readonly potBB: number
  readonly toCallBB: number
  readonly repeatAggro: boolean
  readonly options: readonly PostActionOption[]
  readonly correct: PostAction
  readonly why: string
  /**
   * Знімок борду й руки героя на момент рішення (копії, не посилання).
   * answerPost() викликає advance() перед return, тож на момент, коли
   * викликач читає результат, ep.board уже міг вирости на карту наступної
   * вулиці, а ep.street — перемкнутись. Без копії журнал записав би вулицю,
   * якої герой ще не бачив, коли приймав рішення.
   */
  readonly board: readonly Card[]
  readonly hole: readonly Card[]
  /** Канонічна рука героя: 'AKs', 'AKo', '77' — та сама форма, що вчить префлоп. */
  readonly hand: string
}

export interface PostAnswerResult {
  readonly ok: boolean
  /** Контекст рішення на момент відповіді — саме він іде в журнал. */
  readonly decision: HeroDecision
  readonly finished: EpisodeEnd | null
}

const activeCount = (ep: EpisodeState): number => ep.seats.filter((s) => !s.folded).length

function needsAction(ep: EpisodeState, i: number): boolean {
  const seat = ep.seats[i]
  if (!seat || seat.folded) return false
  // Олл-ін: фішок більше немає, діяти нічим — далі сіт просто чекає шоудауну.
  // Без цієї умови put назавжди лишається < bet і nextActor зациклюється на
  // ньому (guard у advance() це замаскує, але роздача так і не завершиться).
  if (seat.stack <= 0) return false
  if (seat.put < ep.bet) return true
  return !ep.acted.has(i)
}

/** Сіти зберігаються в постфлоп-порядку, тож достатньо першого, хто винен дію. */
function nextActor(ep: EpisodeState): number | undefined {
  for (let i = 0; i < ep.seats.length; i++) if (needsAction(ep, i)) return i
  return undefined
}

function commit(ep: EpisodeState, i: number, amount: number): void {
  const seat = ep.seats[i]
  if (!seat) return
  const pay = Math.max(0, Math.min(amount, seat.stack))
  seat.stack = r(seat.stack - pay)
  seat.put = r(seat.put + pay)
  ep.potBB = r(ep.potBB + pay)
}

/**
 * Доводить внесок сіта до targetPut і за потреби відкриває нове коло дій.
 *
 * Стека може не вистачити на весь targetPut (олл-ін): тоді реальний put після
 * commit() виявляється меншим за задум. Якщо він при цьому не перевищив
 * попередню ep.bet — це фактично колл-олл-ін (або й того менше), а не рейз:
 * ставка стола не повинна ЗМЕНШУВАТИСЬ, і коло дій для решти не перевідкриваємо
 * (інакше хтось, хто вже зрівняв справжню ставку, знову вважався б винним дії).
 */
function placeBet(ep: EpisodeState, i: number, targetPut: number, kind: 'bet' | 'raise'): void {
  const seat = ep.seats[i]
  if (!seat) return
  const before = ep.bet
  commit(ep, i, r(targetPut) - seat.put)
  const raisedPrice = seat.put > before
  ep.bet = Math.max(before, seat.put)
  ep.streetHadBet = true
  if (raisedPrice) {
    ep.raised = kind === 'raise' ? true : ep.raised
    ep.acted = new Set<number>([i])
  } else {
    ep.acted.add(i)
  }
}

function finishByFolds(ep: EpisodeState): void {
  const heroAlive = ep.seats[ep.heroIdx]?.folded === false
  ep.history.push(heroAlive ? 'Усі скинули — банк твій.' : 'Роздача завершена.')
  ep.finished = {
    kind: heroAlive ? 'villains-folded' : 'hero-folded',
    heroWon: heroAlive,
    potBB: ep.potBB,
    shown: [],
  }
}

function showdown(ep: EpisodeState): void {
  const idx = ep.seats.map((_, i) => i).filter((i) => ep.seats[i]?.folded === false)
  const holes = idx.map((i) => ep.seats[i]?.hole ?? [])
  const winners = new Set(showdownWinners(holes, ep.board).map((w) => idx[w]))
  ep.history.push('Шоудаун.')
  ep.finished = {
    kind: 'showdown',
    heroWon: winners.has(ep.heroIdx),
    potBB: ep.potBB,
    shown: idx.map((i) => {
      const seat = ep.seats[i]
      const hole = seat?.hole ?? []
      return {
        pos: seat?.pos ?? POSTFLOP_ORDER[0],
        hole,
        label: RANK_LABEL[rank7([...hole, ...ep.board]).cat] ?? '',
        won: winners.has(i),
      }
    }),
  }
}

function closeStreet(ep: EpisodeState, rng: Rng): void {
  ep.delayed = !ep.streetHadBet
  if (ep.street === 'river') {
    showdown(ep)
    return
  }
  const [card] = drawCards(ep.deck, 1, rng)
  if (card) ep.board.push(card)
  ep.street = ep.street === 'flop' ? 'turn' : 'river'
  ep.bet = 0
  ep.raised = false
  ep.streetHadBet = false
  ep.lastBetFraction = 0
  ep.acted = new Set<number>()
  for (const seat of ep.seats) seat.put = 0
  ep.history.push(`${STREET_LABEL[ep.street]}: ${boardCode(ep.board)}`)
}

function villainAct(ep: EpisodeState, i: number, rng: Rng): void {
  const seat = ep.seats[i]
  if (!seat) return
  const { cat } = evalHand(seat.hole, ep.board)
  const owed = r(ep.bet - seat.put)

  if (owed > 0) {
    const move = villainVsBet(cat, ep.street, ep.lastBetFraction > BIG_PRICE, ep.raised, rng)
    if (move === 'fold') {
      seat.folded = true
      ep.acted.add(i)
      ep.history.push(`${seat.pos} скинув.`)
      return
    }
    if (move === 'call') {
      commit(ep, i, owed)
      ep.acted.add(i)
      ep.history.push(`${seat.pos} заколлював ${owed}bb.`)
      return
    }
    const target = r(ep.bet * RAISE_FACTOR)
    placeBet(ep, i, target, 'raise')
    ep.lastBetFraction = 1
    ep.villainAggro++
    ep.history.push(`${seat.pos} рейзить до ${target}bb.`)
    return
  }

  // Ставки немає. У лінії колера єдиний опонент — префлоп-агресор: на флопі
  // його ставка це c-bet (широкий, §6), а не донк, бо донк-частоти описують
  // опонента, який агресором не був. На терні й рівері він барелить за
  // bet-таблицею. У лінії агресора все як було: до дії героя — донк, після —
  // звичайна ставка у слабкість.
  const move =
    ep.line === 'caller'
      ? ep.street === 'flop'
        ? villainCbet(cat, rng)
        : villainOpen(cat, ep.street, rng)
      : ep.acted.has(ep.heroIdx)
        ? villainOpen(cat, ep.street, rng)
        : villainDonk(cat, ep.street, rng)
  if (move === 'check') {
    ep.acted.add(i)
    ep.history.push(`${seat.pos} чекнув.`)
    return
  }
  const frac = villainBetFraction(cat)
  const size = r(ep.potBB * frac)
  ep.lastBetFraction = frac
  placeBet(ep, i, seat.put + size, 'bet')
  ep.villainAggro++
  ep.history.push(`${seat.pos} ставить ${size}bb.`)
}

/** Прокручує дії опонентів, доки не настане черга героя або роздача не скінчиться. */
export function advance(ep: EpisodeState, rng: Rng): void {
  let guard = 0
  while (ep.finished === null && guard++ < 500) {
    if (activeCount(ep) <= 1) {
      finishByFolds(ep)
      return
    }
    const next = nextActor(ep)
    if (next === undefined) {
      closeStreet(ep, rng)
      continue
    }
    if (next === ep.heroIdx) return
    villainAct(ep, next, rng)
  }
}

function betOptions(ep: EpisodeState): PostActionOption[] {
  return [
    { k: 'check', l: 'Чек', c: 'ghost' },
    { k: 'b33', l: `Ставка 33% · ${r(ep.potBB * 0.33)}bb`, c: 'soft' },
    { k: 'b66', l: `Ставка 66% · ${r(ep.potBB * 0.66)}bb`, c: 'primary' },
  ]
}

function defendOptions(ep: EpisodeState, facing: Facing, owed: number): PostActionOption[] {
  const base: PostActionOption[] = [
    { k: 'fold', l: 'Фолд', c: 'ghost' },
    { k: 'call', l: `Колл ${owed}bb`, c: 'mid' },
  ]
  // Проти рейзу ре-рейзу немає: рейз пасивного гравця означає силу (спека §3.3).
  if (facing === 'raise') return base
  return [...base, { k: 'raise', l: `Рейз ${r(ep.bet * RAISE_FACTOR)}bb`, c: 'primary' }]
}

export function heroDecision(ep: EpisodeState): HeroDecision | null {
  if (ep.finished !== null) return null
  const hero = ep.seats[ep.heroIdx]
  if (!hero || hero.folded) return null
  if (!needsAction(ep, ep.heroIdx)) return null

  const ev = evalHand(hero.hole, ep.board)
  const events = boardEvents(ep.board)
  const nOpps = ep.seats.filter((s) => !s.folded && !s.hero).length
  // Роздача, а не миттєвий стан: фолди пізніше не звужують цей список.
  const oppPositions = ep.seats.filter((s) => !s.hero).map((s) => s.pos)
  const owed = r(ep.bet - hero.put)

  // Facing визначаємо через ep.raised, а не через hero.put > 0: у мультиполі
  // рейз міг статись між іншими опонентами ще ДО першого погляду героя на цю
  // вулицю (герой ще нічого не клав, put === 0), і це все одно рейз, а не
  // перша ставка. hero.put > 0 тут дає хибний негатив.
  const facing: Facing =
    owed <= 0
      ? 'none'
      : ep.raised
        ? 'raise'
        : ep.lastBetFraction > BIG_PRICE
          ? 'big_bet'
          : 'small_bet'

  // §5.4: у лінії колера будь-яка перша ставка на флопі і є c-bet агресора —
  // інших опонентів у роздачі немає, а рейз веде в §5.6.
  const vsCbet = ep.line === 'caller' && ep.street === 'flop' && !ep.raised

  const decision =
    facing === 'none'
      ? decideBet({
          street: ep.street,
          line: ep.line,
          cat: ev.cat,
          texture: ep.texture,
          events,
          nOpps,
          ip: ep.ip,
          delayed: ep.delayed,
          madeFlush: ev.madeFlush,
        })
      : decideDefend({
          street: ep.street,
          facing,
          cat: ev.cat,
          nOpps,
          repeatAggro: ep.villainAggro > 1,
          vsCbet,
        })

  return {
    street: ep.street,
    line: ep.line,
    facing,
    cat: ev.cat,
    label: ev.label,
    texture: ep.texture,
    events,
    nOpps,
    oppPositions,
    ip: ep.ip,
    potBB: ep.potBB,
    toCallBB: Math.max(0, owed),
    repeatAggro: ep.villainAggro > 1,
    options: facing === 'none' ? betOptions(ep) : defendOptions(ep, facing, owed),
    correct: decision.action,
    why: decision.why,
    // Копії, не посилання: ep.board/hero.hole лишаються мутабельними масивами
    // всередині рушія (closeStreet() робить ep.board.push), а це рішення має
    // пам'ятати спот таким, яким його бачив герой у момент вибору.
    board: [...ep.board],
    hole: [...hero.hole],
    hand: handOf(hero.hole),
  }
}

export function answerPost(ep: EpisodeState, chosen: PostAction, rng: Rng): PostAnswerResult {
  const decision = heroDecision(ep)
  if (decision === null) throw new Error('героєві зараз не треба діяти')

  const hero = ep.seats[ep.heroIdx]
  if (!hero) throw new Error('епізод без героя')
  const ok = chosen === decision.correct

  if (chosen === 'fold') {
    hero.folded = true
    ep.acted.add(ep.heroIdx)
    ep.history.push('Ти скинув.')
    ep.finished = { kind: 'hero-folded', heroWon: false, potBB: ep.potBB, shown: [] }
    return { ok, decision, finished: ep.finished }
  }

  if (chosen === 'check') {
    ep.acted.add(ep.heroIdx)
    ep.history.push('Ти чекнув.')
  } else if (chosen === 'call') {
    const owed = r(ep.bet - hero.put)
    commit(ep, ep.heroIdx, owed)
    ep.acted.add(ep.heroIdx)
    ep.history.push(`Ти заколлював ${owed}bb.`)
  } else if (chosen === 'raise') {
    const target = r(ep.bet * RAISE_FACTOR)
    placeBet(ep, ep.heroIdx, target, 'raise')
    ep.lastBetFraction = 1
    ep.history.push(`Ти рейзнув до ${target}bb.`)
  } else {
    const frac = chosen === 'b33' ? 0.33 : 0.66
    const size = r(ep.potBB * frac)
    ep.lastBetFraction = frac
    placeBet(ep, ep.heroIdx, hero.put + size, 'bet')
    ep.history.push(`Ти поставив ${size}bb.`)
  }

  advance(ep, rng)
  return { ok, decision, finished: ep.finished }
}

/** Роздає епізод і одразу прокручує його до першого рішення героя. */
export function startEpisode(options: BuildOptions = {}): EpisodeState {
  const rng = options.rng ?? Math.random
  const ep = buildEpisode(options)
  advance(ep, rng)
  return ep
}
