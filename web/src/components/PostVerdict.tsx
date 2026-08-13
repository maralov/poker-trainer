/**
 * Вердикт постфлопного рішення: правильність, контекст (рука/категорія/
 * текстура/режим столу), пояснення і — якщо ця відповідь завершила роздачу —
 * підсумок: хто скинув чи що показали на шоудауні.
 */

import {
  POST_ACT_LABEL,
  POST_CAT_LABEL,
  TEX_LABEL,
  type EpisodeEnd,
  type HeroDecision,
} from '../engine/postflop'

export function PostVerdict({
  decision,
  ok,
  handOver,
  onNext,
}: {
  decision: HeroDecision
  ok: boolean
  handOver: EpisodeEnd | null
  onNext: () => void
}) {
  return (
    <div className={`verdict ${ok ? 'ok' : 'no'}`}>
      <h3>{ok ? 'Правильно' : 'Помилка'}</h3>

      <div className="tags">
        <span className="tag hand">{decision.label}</span>
        <span className="tag">{POST_CAT_LABEL[decision.cat]}</span>
        <span className="tag">дошка {TEX_LABEL[decision.texture]}</span>
        <span className="tag">{decision.nOpps >= 2 ? 'мультипот' : 'хедз-ап'}</span>
        <span className="tag">{decision.ip ? 'IP' : 'OOP'}</span>
      </div>

      <p>
        Правильно тут — <strong>{POST_ACT_LABEL[decision.correct]}</strong>. {decision.why}
      </p>

      {handOver && (
        <p className="note">
          {handOver.kind === 'hero-folded' && 'Ти скинув — роздача завершена'}
          {handOver.kind === 'villains-folded' && 'Усі скинули, банк твій'}
          {handOver.kind === 'showdown' && (
            <>
              <strong>Шоудаун</strong>
              {handOver.shown.map((s) => (
                <span key={s.pos} style={{ display: 'block' }}>
                  {`${s.pos}: ${s.label}${s.won ? ' · переможець' : ''}`}
                </span>
              ))}
            </>
          )}
        </p>
      )}

      <button type="button" className="next" onClick={onNext}>
        {handOver ? 'Наступна рука · пробіл' : 'Далі · пробіл'}
      </button>
    </div>
  )
}
