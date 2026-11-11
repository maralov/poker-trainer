/**
 * Дрібні карти з запису борду чи руки ('Ks7d2c'): для розбору, де повноцінні
 * карти стола завеликі, а сирий рядок читається гірше.
 *
 * Чотириколірна колода заливкою, як у мобільних покер-клієнтах: у такому
 * розмірі масть упізнається за кольором тла раніше, ніж за значком. Значок —
 * SVG, а не символ шрифту: ♠♣ у дрібному кеглі зливаються в пляму, а на iOS
 * ♥♦ ще й можуть стати емодзі.
 */

const PATHS: Readonly<Record<string, string>> = {
  s: 'M12 2C9 6 3 9.5 3 14a4.5 4.5 0 0 0 7.6 3.2L9.5 22h5l-1.1-4.8A4.5 4.5 0 0 0 21 14c0-4.5-6-8-9-12z',
  h: 'M12 21s-7.6-4.6-10-9.4C.3 8.2 2.5 4 6.4 4c2.3 0 3.9 1.3 5.6 3.3C13.7 5.3 15.3 4 17.6 4c3.9 0 6.1 4.2 4.4 7.6C19.6 16.4 12 21 12 21z',
  d: 'M12 2l8.5 10L12 22 3.5 12z',
  c: 'M12 2.5a4.3 4.3 0 0 0-3.9 6.1A4.3 4.3 0 1 0 10.7 16L9.5 22h5l-1.2-6a4.3 4.3 0 1 0 2.6-7.4A4.3 4.3 0 0 0 12 2.5z',
}

const SUIT_CLASS: Readonly<Record<string, string>> = { s: 'spade', h: 'heart', d: 'diam', c: 'club' }

export function MiniCards({ code }: { code: string }) {
  const cards: [string, string][] = []
  for (let i = 0; i + 1 < code.length; i += 2) {
    const suit = code[i + 1] ?? ''
    // Запис приходить із бази: незнайому масть пропускаємо, а не малюємо «?».
    if (PATHS[suit]) cards.push([code[i] === 'T' ? '10' : (code[i] ?? ''), suit])
  }
  return (
    <span className="mini-cards" aria-label={code}>
      {cards.map(([rk, suit], i) => (
        <span key={i} className={`mini-card ${SUIT_CLASS[suit]}`}>
          {rk}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={PATHS[suit]} />
          </svg>
        </span>
      ))}
    </span>
  )
}
