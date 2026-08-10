import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { startSync } from './api/sync'
import App from './App.tsx'
import { initAuth } from './store/authStore'
import './index.css'
import './styles/app.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

// Ініціалізація поза React: підписки на сесію і фоновий синк живуть стільки ж,
// скільки вкладка, і не мають перезапускатись на кожен ре-рендер.
initAuth()
startSync()

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
