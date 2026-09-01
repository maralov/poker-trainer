import type { Card } from '../engine/types'

/**
 * Чотириколірна колода: ♠ чорна, ♥ червона, ♦ синя, ♣ зелена. Порядок збігається
 * з SUITS в engine/cards.ts, тож індекс масті `c.s` і є ключем. Двоколірна
 * колода змушує розрізняти ♠ і ♣ за формою значка — на дошці з чотирьох-пʼяти
 * карт це зайва робота очима, через яку флеш-дро помічають із запізненням.
 */
const SUIT_CLASS = ['spade', 'heart', 'diam', 'club'] as const

export function HandCards({ cards, hero = true }: { cards: readonly Card[]; hero?: boolean }) {
  return (
    <div className="cards" style={{ marginTop: 14 }}>
      {cards.map((c, i) => (
        // Ключ за індексом свідомо: у роздачі рівно дві карти, і вони
        // замінюються цілим набором, а не переставляються.
        <div key={i} className={`card ${SUIT_CLASS[c.s] ?? 'spade'}${hero ? ' hero' : ''}`}>
          {/* Десятку показуємо цифрами: «10» читається з першого погляду, «T»
              треба перекладати. У канонічному записі руки ('JTs') лишається T —
              це стандартна нотація діапазонів, і сітка 13×13 на ній тримається. */}
          <div className={`r${c.rk === 'T' ? ' ten' : ''}`}>{c.rk === 'T' ? '10' : c.rk}</div>
          <div className="s">{c.g}</div>
        </div>
      ))}
    </div>
  )
}
