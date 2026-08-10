import { useState } from 'react'

import { GateLock } from './components/GateLock'
import { gateStatus } from './engine/gate'
import { useTrainHotkeys } from './hooks/useHotkeys'
import { Ranges } from './pages/Ranges'
import { Review } from './pages/Review'
import { Stats } from './pages/Stats'
import { Train } from './pages/Train'
import { useProgressStore } from './store/progressStore'

type Stage = 'pre' | 'post'
type Tab = 'train' | 'ranges' | 'stats' | 'review'

const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'train', label: 'Тренування' },
  { key: 'ranges', label: 'Діапазони' },
  { key: 'stats', label: 'Статистика' },
  { key: 'review', label: 'Розбір' },
]

export default function App() {
  const [stage, setStage] = useState<Stage>('pre')
  const [tab, setTab] = useState<Tab>('train')

  const pre = useProgressStore((s) => s.pre)
  const postUnlocked = useProgressStore((s) => s.postUnlocked)
  const legacyImported = useProgressStore((s) => s.legacyImported)
  const dismissLegacyNotice = useProgressStore((s) => s.dismissLegacyNotice)

  useTrainHotkeys(stage === 'pre' && tab === 'train')

  const g = gateStatus(pre.recent, pre.total)
  const doneCount = [g.c1, g.c2, g.c3, g.c4].filter(Boolean).length

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <h1>
            Покер-тренажер <span>·</span> 9-max
          </h1>
          <div className="sub">Кеш · лузове мікро-поле</div>
        </div>
      </div>

      {legacyImported !== null && (
        <div className="banner">
          <b>Прогрес перенесено</b>
          <span>
            Зі standalone-версії підтягнуто {legacyImported} рук. Старий файл лишився недоторканим.{' '}
            <button type="button" className="link" onClick={dismissLegacyNotice}>
              Зрозуміло
            </button>
          </span>
        </div>
      )}

      <div className="stages">
        <button
          type="button"
          className={`stg${stage === 'pre' ? ' on' : ''}`}
          onClick={() => setStage('pre')}
        >
          <b>Етап 1 · Префлоп</b>
          <span>
            {pre.total ? `${pre.total} рук · ${Math.round(g.acc)}%` : 'почни звідси'}
          </span>
        </button>
        <button
          type="button"
          className={`stg${stage === 'post' ? ' on' : ''}${postUnlocked ? '' : ' locked'}`}
          onClick={() => setStage('post')}
        >
          <b>Етап 2 · Постфлоп</b>
          <span>{postUnlocked ? 'відкрито' : `виконано ${doneCount} з 4 умов`}</span>
          {!postUnlocked && <span className="lockmark">Закрито</span>}
        </button>
      </div>

      {stage === 'pre' ? (
        <>
          <div className="tabs">
            {TABS.map((t) => (
              <button
                type="button"
                key={t.key}
                className={`tab${tab === t.key ? ' on' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'train' && <Train />}
          {tab === 'ranges' && <Ranges />}
          {tab === 'stats' && <Stats />}
          {tab === 'review' && <Review />}
        </>
      ) : postUnlocked ? (
        <div className="panel">
          <div className="lock-head">
            <b>Етап 2 відкрито</b>
            <span>
              Префлоп закритий за всіма чотирма умовами. Сам постфлоп-тренажер зʼявиться окремим
              кроком — до того часу тримай форму на префлопі.
            </span>
          </div>
        </div>
      ) : (
        <GateLock />
      )}
    </div>
  )
}
