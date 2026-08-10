/**
 * Смужка акаунта: хто ти, стан синку, вхід/вихід.
 *
 * Вхід не обовʼязковий: без нього тренування працює, прогрес лежить локально,
 * а події чекають у черзі. Логін вмикає синхронізацію між пристроями.
 */

import { flushNow, useSyncStore } from '../api/sync'
import { useAuthStore } from '../store/authStore'

function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5C3 17.1 2.1 20.4 2.1 24s.9 6.9 2.4 9.9l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.4 12.2-9.4z"
      />
    </svg>
  )
}

export function AccountBar() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const authError = useAuthStore((s) => s.error)
  const signIn = useAuthStore((s) => s.signInWithGoogle)
  const signOut = useAuthStore((s) => s.signOut)

  const pending = useSyncStore((s) => s.pending)
  const syncing = useSyncStore((s) => s.syncing)
  const syncError = useSyncStore((s) => s.error)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)

  if (loading) return <div className="account" aria-busy="true" />

  const status = !user
    ? pending > 0
      ? `${pending} у черзі · увійди, щоб зберегти`
      : 'прогрес лише в цьому браузері'
    : syncing
      ? 'синхронізація…'
      : syncError
        ? `не синхронізовано: ${pending} у черзі`
        : pending > 0
          ? `${pending} у черзі`
          : lastSyncedAt
            ? 'усе синхронізовано'
            : 'синхронізовано'

  return (
    <div className="account">
      <span className={`sync${syncError ? ' bad' : pending > 0 ? ' wait' : ' ok'}`}>{status}</span>

      {user ? (
        <>
          <span className="who">{user.email}</span>
          {pending > 0 && (
            <button type="button" className="link" onClick={() => void flushNow()}>
              Синхронізувати
            </button>
          )}
          <button type="button" className="link" onClick={() => void signOut()}>
            Вийти
          </button>
        </>
      ) : (
        <button type="button" className="gbtn" onClick={() => void signIn()}>
          <GoogleMark />
          Увійти через Google
        </button>
      )}

      {authError && <span className="sync bad">{authError}</span>}
    </div>
  )
}
