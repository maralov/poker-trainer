/**
 * Фаза 0 — заглушка. У Фазі 1 сюди переїде тренажер з poker-trainer.html.
 */
export default function App() {
  return (
    <div className="wrap">
      <h1
        style={{
          fontFamily: "'Bodoni Moda', serif",
          fontSize: 31,
          fontWeight: 600,
          margin: 0,
          lineHeight: 1,
        }}
      >
        Покер-тренажер <span style={{ color: 'var(--brass)' }}>·</span> 9-max
      </h1>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginTop: 8,
        }}
      >
        Фаза 0 · скелет зібрано
      </div>
    </div>
  )
}
