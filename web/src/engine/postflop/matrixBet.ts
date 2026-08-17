/**
 * Матриці контексту «чекнуто до тебе, можна ставити».
 *
 * Флоп — порт decide()/pfExplain() з poker-trainer.html 1:1 (звіряється з
 * ref-postflop.json). Терн і рівер джерела в референсі не мають: вони описані
 * спекою, §5.2 і §5.3.
 */

import type { BoardEvents, PostAction, PostCategory, PostLine, Street, Texture } from './types'
import { isStrong } from './types'

export interface BetContext {
  readonly street: Street
  /** Роль героя: у колера на флопі поза позицією донк-бетів немає (§5.1а). */
  readonly line: PostLine
  readonly cat: PostCategory
  readonly texture: Texture
  readonly events: BoardEvents
  readonly nOpps: number
  readonly ip: boolean
  /** На попередній вулиці ставок не було — діапазони слабкі з обох боків. */
  readonly delayed: boolean
  readonly madeFlush: boolean
}

export interface Decision {
  readonly action: PostAction
  readonly why: string
}

const MULTI_VALUE =
  'Мультипот. Ставиш виключно валью і великим сайзом: троє опонентів дадуть колл достатньо часто, а дешева ставка просто пускає всіх на дешеві дро.'
const MULTI_DRAW_IP =
  'У позиції з сильним дро у мультипоті ставка виправдана: достатньо еквіті, а позиція дозволяє контролювати банк далі.'
const MULTI_DRAW_OOP =
  'Сильне дро поза позицією в мультипоті — чек. Немає ні фолд-еквіті проти трьох, ні контролю над банком.'
const CALLER_FLOP_CHECK: Decision = {
  action: 'check',
  why: 'Донк-бетів у моделі немає: поза позицією проти префлоп-агресора чекаємо. Він c-betить широко — далі граємо за матрицею захисту; а якщо чекне слідом, терн уже наш.',
}
const MULTI_NO_BLUFF =
  'Головне правило мультипоту: не блефувати. Коли на флопі троє і більше, хтось майже завжди має пару чи дро — твій блеф не має адресата.'

/** Флоп, порт pfExplain() 1:1 — послідовність гілок повторює decide(). */
function whyFlop(cat: PostCategory, tex: Texture, nOpps: number, ip: boolean): string {
  if (nOpps >= 2) {
    if (isStrong(cat)) return MULTI_VALUE
    if (cat === 'DRAW') return ip ? MULTI_DRAW_IP : MULTI_DRAW_OOP
    return MULTI_NO_BLUFF
  }
  if (isStrong(cat))
    return tex === 'WET'
      ? 'Сильна рука на мокрій дошці — великий сайз. Ти не просто збираєш валью, а змушуєш дро платити неправильну ціну.'
      : 'Сильна рука на сухій дошці — маленький сайз. Опонент рідко має чим платити багато, а дрібна ставка тримає його слабкі руки в грі.'
  if (cat === 'DRAW')
    return tex === 'WET'
      ? 'Напівблеф з сильним дро працює двома способами: опонент фолдить зараз або платить, коли ти влучаєш.'
      : 'З сильним дро на сухій дошці вистачить маленької ставки: фолд-еквіті і так високе.'
  if (cat === 'MEDIUM')
    return tex === 'WET'
      ? 'Середня рука на мокрій дошці — чек. Ставлячи, ти виганяєш усе гірше і платиш усьому кращому.'
      : 'Середня рука на сухій дошці витримує одну маленьку ставку: гірші руки платять, дошка небезпечно не розвивається.'
  if (cat === 'WEAK')
    return 'Слабка пара має шоудаун-валью, але ставкою ти його вбиваєш. Чекай і дійди до шоудауну дешево.'
  if (tex === 'WET')
    return 'Порожня рука на мокрій дошці — чек. Така текстура влучає в калл-діапазон опонента частіше, ніж у твій.'
  return ip
    ? 'Порожньо, але дошка суха і ти в позиції — маленька ставка забирає банк достатньо часто, щоб бути плюсовою. Це основний двигун c-bet стратегії.'
    : 'Порожньо і поза позицією — чек. Без позиції блеф доводиться продовжувати наосліп на терні, і саме там губляться гроші.'
}

/** Флоп, порт decide() 1:1. Розщеплення STRONG тут згортається назад. */
function actionFlop(cat: PostCategory, tex: Texture, nOpps: number, ip: boolean): PostAction {
  if (nOpps >= 2) {
    if (isStrong(cat)) return 'b66'
    if (cat === 'DRAW') return ip ? 'b66' : 'check'
    return 'check'
  }
  if (isStrong(cat) || cat === 'DRAW') return tex === 'WET' ? 'b66' : 'b33'
  if (cat === 'MEDIUM') return tex === 'WET' ? 'check' : 'b33'
  if (cat === 'WEAK') return 'check'
  if (tex === 'WET') return 'check'
  return ip ? 'b33' : 'check'
}

function decideTurn(c: BetContext): Decision {
  const { cat, events, ip, delayed, madeFlush } = c
  if (isStrong(cat)) {
    return events.flushClosed && !madeFlush
      ? {
          action: 'b33',
          why: 'Масть на борді закрилась. Валью лишається, але сайз тонший: велика ставка тут платиться переважно флешем, тобто рукою, яка тебе вже бʼє.',
        }
      : {
          action: 'b66',
          why: 'Другий барель сильною рукою — великим сайзом. Колер флопу вже показав пару чи дро, і саме зараз він платить найохочіше.',
        }
  }
  if (cat === 'DRAW')
    return ip
      ? {
          action: 'b66',
          why: 'Другий барель напівблефом виправданий позицією: є еквіті на рівер і контроль над тим, скільки коштуватиме роздача.',
        }
      : {
          action: 'check',
          why: 'Дро поза позицією на терні — чек. Барель наосліп коштує дорого, а рівер ти все одно гратимеш першим.',
        }
  if (cat === 'MEDIUM')
    return delayed && !events.overcard
      ? {
          action: 'b33',
          why: 'Після чек-чеку на флопі діапазони обох слабкі, а карта нічого не змінила — маленька ставка збирає тонке валью з гірших рук.',
        }
      : {
          action: 'check',
          why: 'Середня рука на терні — чек. Опонент, який заколлював флоп, гіршим уже не платить, а кращим ти платиш сам.',
        }
  if (cat === 'WEAK')
    return {
      action: 'check',
      why: 'Слабка пара доходить до шоудауну лише дешево. Ставка перетворює її на блеф без фолд-еквіті.',
    }
  if (cat === 'WEAKDRAW')
    return {
      action: 'check',
      why: 'Гатшот або оверкарти на терні — замало еквіті для другої кулі. Дивись рівер дешево.',
    }
  return delayed && ip
    ? {
        action: 'b33',
        why: 'Обидва чекнули флоп — це найслабший діапазон опонента за всю роздачу. Дешевий стаб у позиції тут забирає банк достатньо часто.',
      }
    : {
        action: 'check',
        why: 'Колер флопу терн майже не фолдить: продовжувати блеф ні до кого. Одна куля і зупинка — «one and done».',
      }
}

function decideRiver(c: BetContext): Decision {
  if (isStrong(c.cat))
    return {
      action: 'b66',
      why: 'Рівер сильною рукою — це чисте валью. Поле, яке дійшло сюди, коллить значно ширше, ніж здається; чек тут просто дарує гроші.',
    }
  return {
    action: 'check',
    why: 'На рівері проти станцій не блефують — ніколи. Без сильної руки чек: або дешевий шоудаун, або програна роздача, але без зайвої ставки.',
  }
}

function decideMulti(c: BetContext): Decision {
  if (isStrong(c.cat)) return { action: 'b66', why: MULTI_VALUE }
  if (c.cat === 'DRAW' && c.street !== 'river')
    return c.ip
      ? { action: 'b66', why: MULTI_DRAW_IP }
      : { action: 'check', why: MULTI_DRAW_OOP }
  return { action: 'check', why: MULTI_NO_BLUFF }
}

/** Єдиний вхід контексту «можу ставити». */
export function decideBet(c: BetContext): Decision {
  // §5.1а: колер OOP на флопі діє першим — і завжди чекає. Правило сильніше за
  // решту матриці, тому стоїть перед мультивеєм (лінія колера завжди хедз-ап).
  if (c.line === 'caller' && c.street === 'flop' && !c.ip) return CALLER_FLOP_CHECK
  if (c.nOpps >= 2) return decideMulti(c)
  if (c.street === 'flop')
    return {
      action: actionFlop(c.cat, c.texture, c.nOpps, c.ip),
      why: whyFlop(c.cat, c.texture, c.nOpps, c.ip),
    }
  if (c.street === 'turn') return decideTurn(c)
  return decideRiver(c)
}
