/**
 * Матриці проти агресії опонента: §5.5 (ставка) і §5.6 (рейз) спеки.
 *
 * Головна ідея, яку вони тренують: у лузово-пасивному полі агресія майже
 * завжди означає силу. Тому «продовжувати» тут — виняток, а не норма, і
 * ключова межа проходить між двома парами (STRONG_MADE) і однією (STRONG_PAIR).
 *
 * §5.4 (лінія колера проти c-bet) — окремий контекст фази post-4.
 */

import type { Decision } from './matrixBet'
import type { Facing, PostCategory, Street } from './types'

export interface DefendContext {
  readonly street: Street
  /** 'none' сюди не потрапляє — це контекст matrixBet. */
  readonly facing: Facing
  readonly cat: PostCategory
  readonly nOpps: number
  /** Опонент уже проявляв агресію раніше в цій руці — це друга куля. */
  readonly repeatAggro: boolean
}

const FOLD_TRASH: Decision = {
  action: 'fold',
  why: 'Рука не має ні шоудаун-валью, ні достатнього еквіті, а пасивний опонент ставить із силою. Фолд тут — не слабкість, а економія.',
}

const CALL_TWO_PAIR: Decision = {
  action: 'call',
  why: 'Дві пари й краще знизу не скидаються. Проти сили не роздуваємо банк рейзом, але й не віддаємо руку, яка виграє достатньо часто.',
}

const RAISE_VALUE: Decision = {
  action: 'raise',
  why: 'Мала ставка від пасивного гравця — це або тонке валью, або спроба дешево дійти до шоудауну. Рейз двома парами будує банк, поки він ще платить.',
}

const CALL_ONE_PAIR: Decision = {
  action: 'call',
  why: 'Одна пара платить рівно один раз. Далі кожна нова ставка пасивного опонента робить її гіршою, а не кращою.',
}

const FOLD_ONE_PAIR: Decision = {
  action: 'fold',
  why: 'Друга куля пасивного гравця бʼє одну пару майже завжди. Саме тут мікроліміти губляться найдорожче — на «ну в мене ж топ-пара».',
}

const CALL_DRAW: Decision = {
  action: 'call',
  why: 'Дро платить, поки ціна дешева і попереду ще карти. Рейз-напівблеф проти того, хто не фолдить, працює лише проти себе.',
}

const FOLD_DRAW: Decision = {
  action: 'fold',
  why: 'Одна карта попереду не окупає велику ставку. Імплайди в лузовому полі є, але не такі, щоб платити цю ціну.',
}

const CALL_MEDIUM: Decision = {
  action: 'call',
  why: 'Одна дешева ставка на флопі — прийнятна ціна за середню руку з шоудаун-валью. Одна, не серія.',
}

const FOLD_MEDIUM: Decision = {
  action: 'fold',
  why: 'На терні діапазон ставки вже бʼє другу пару. Далі ця рука лише платитиме — і саме тому її скидають зараз.',
}

const CALL_RIVER_CATCH: Decision = {
  action: 'call',
  why: 'Дешева ставка на рівері — єдиний випадок, коли блеф-кетч однією парою окупається: навіть рідкісний блеф робить цей колл плюсовим.',
}

const FOLD_RIVER: Decision = {
  action: 'fold',
  why: 'Пасивні гравці на рівері не блефують. Велика ставка тут — завжди рука, і колл із однією парою просто дарує стек.',
}

const FOLD_MULTI: Decision = {
  action: 'fold',
  why: 'Проти двох і більше опонентів хтось у полі майже завжди має справжню руку. Продовжують лише дві пари й краще, а одна пара — тільки проти першої дешевої ставки.',
}

function defendRaise(c: DefendContext): Decision {
  if (c.cat === 'STRONG_MADE') return CALL_TWO_PAIR
  if (c.cat === 'STRONG_PAIR') return c.street === 'flop' ? CALL_ONE_PAIR : FOLD_ONE_PAIR
  if (c.cat === 'DRAW') return c.street === 'flop' ? CALL_DRAW : FOLD_DRAW
  return FOLD_TRASH
}

function defendRiverBet(c: DefendContext): Decision {
  if (c.cat === 'STRONG_MADE') return CALL_TWO_PAIR
  if (c.cat === 'STRONG_PAIR')
    return c.facing === 'small_bet' && !c.repeatAggro ? CALL_RIVER_CATCH : FOLD_RIVER
  return FOLD_RIVER
}

function defendBet(c: DefendContext): Decision {
  const big = c.facing === 'big_bet'
  if (c.cat === 'STRONG_MADE') {
    if (c.repeatAggro) return CALL_TWO_PAIR
    return big ? CALL_TWO_PAIR : RAISE_VALUE
  }
  if (c.cat === 'STRONG_PAIR') return c.repeatAggro ? FOLD_ONE_PAIR : CALL_ONE_PAIR
  if (c.cat === 'DRAW') {
    if (c.repeatAggro) return FOLD_DRAW
    if (!big) return CALL_DRAW
    return c.street === 'flop' ? CALL_DRAW : FOLD_DRAW
  }
  if (c.cat === 'MEDIUM') {
    if (c.repeatAggro || big) return FOLD_MEDIUM
    return c.street === 'flop' ? CALL_MEDIUM : FOLD_MEDIUM
  }
  return FOLD_TRASH
}

/** Рішення за хедз-ап-матрицями §5.5/§5.6 — незалежно від кількості опонентів. */
function baseDecision(c: DefendContext): Decision {
  if (c.facing === 'raise') return defendRaise(c)
  if (c.street === 'river') return defendRiverBet(c)
  return defendBet(c)
}

/**
 * Мультивей-модифікатор (§5.5–§5.6, «Мультивей-модифікатор»): STRONG_MADE
 * далі грає за тим самим рядком матриці, що й хедз-ап (спека прямо каже
 * «як у матриці» — тобто розмір ставки й repeatAggro так само вирішують
 * call/raise). STRONG_PAIR звужується до єдиного винятку — колл проти першої
 * малої ставки; решта категорій завжди фолдить, коли опонентів двоє й більше.
 */
export function decideDefend(c: DefendContext): Decision {
  const base = baseDecision(c)
  if (c.nOpps < 2) return base
  if (c.cat === 'STRONG_MADE') return base
  if (c.cat === 'STRONG_PAIR' && c.facing === 'small_bet' && !c.repeatAggro) return base
  return FOLD_MULTI
}
