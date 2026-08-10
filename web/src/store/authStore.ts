/**
 * Сесія користувача. Вхід — лише через Google.
 *
 * Токени, їх оновлення і збереження між перезавантаженнями тримає supabase-js;
 * тут лише те, що потрібно інтерфейсу.
 */

import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'

import { supabase } from '../api/supabase'

export interface AuthState {
  session: Session | null
  user: User | null
  /** Поки true — ще не знаємо, чи є збережена сесія. Не показуємо ні логін, ні профіль. */
  loading: boolean
  error: string | null

  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  session: null,
  user: null,
  loading: true,
  error: null,

  signInWithGoogle: async () => {
    set({ error: null })
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          // Просимо refresh-токен і показуємо вибір акаунта, а не мовчазний вхід
          // у той, що вже відкритий у браузері.
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    })
    if (error) set({ error: error.message })
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) set({ error: error.message })
  },

  clearError: () => set({ error: null }),
}))

/**
 * Підписка на зміни сесії. Викликається один раз при старті застосунку.
 * Повертає функцію відписки.
 */
export function initAuth(): () => void {
  void supabase.auth.getSession().then(({ data }) => {
    useAuthStore.setState({
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
    })
  })

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({
      session,
      user: session?.user ?? null,
      loading: false,
    })
  })

  return () => data.subscription.unsubscribe()
}
