import { useState } from 'react'

import { AccountBar } from './components/AccountBar'
import { GateLock } from './components/GateLock'
import { gateStatus } from './engine/gate'
import { usePostTrainHotkeys, useTrainHotkeys } from './hooks/useHotkeys'
import { PostRules } from './pages/PostRules'
import { Ranges } from './pages/Ranges'
import { Review } from './pages/Review'
import { Stats } from './pages/Stats'
import { Train } from './pages/Train'
import { TrainPost } from './pages/TrainPost'
import { useProgressStore } from './store/progressStore'
import { useStatsSource } from './store/statsSource'

type Stage = 'pre' | 'post'
type Tab = 'train' | 'ranges' | 'stats' | 'review'
type PostTab = 'train' | 'rules' | 'stats' | 'review'

const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'train', label: 'Тренування' },
  { key: 'ranges', label: 'Діапазони' },
  { key: 'stats', label: 'Статистика' },
  { key: 'review', label: 'Розбір' },
]

// Етап 2 має свій набір: замість чартів діапазонів — схема постфлоп-рішень.
const POST_TABS: readonly { key: PostTab; label: string }[] = [
  { key: 'train', label: 'Тренування' },
  { key: 'rules', label: 'Схема рішень' },
  { key: 'stats', label: 'Статистика' },
  { key: 'review', label: 'Розбір' },
]

export default function App() {
  const [stage, setStage] = useState<Stage>('pre')
  const [tab, setTab] = useState<Tab>('train')
  const [postTab, setPostTab] = useState<PostTab>('train')

  const pre = useStatsSource().progress
  const postUnlocked = useProgressStore((s) => s.postUnlocked)
  const legacyImported = useProgressStore((s) => s.legacyImported)
  const dismissLegacyNotice = useProgressStore((s) => s.dismissLegacyNotice)

  useTrainHotkeys(stage === 'pre' && tab === 'train')
  // Хоткеї живуть лише на вкладці тренування: інакше «1» на схемі рішень
  // відповідала б за героя, поки учень просто читає таблиці.
  usePostTrainHotkeys(stage === 'post' && postUnlocked && postTab === 'train')

  const g = gateStatus(pre.recent, pre.total)
  const doneCount = [g.c1, g.c2, g.c3, g.c4].filter(Boolean).length

  return (
    <div className="wrap">
      <AccountBar />
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
        <>
          <div className="tabs">
            {POST_TABS.map((t) => (
              <button
                type="button"
                key={t.key}
                className={`tab${postTab === t.key ? ' on' : ''}`}
                onClick={() => setPostTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {postTab === 'train' && <TrainPost />}
          {postTab === 'rules' && <PostRules />}
        </>
      ) : (
        <GateLock />
      )}
    </div>
  )
}
