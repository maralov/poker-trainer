/**
 * Клієнт Supabase.
 *
 * Anon-ключ публічний за визначенням — він потрапляє у бандл і це нормально.
 * Ізоляцію користувачів забезпечують RLS-політики в supabase/migrations,
 * а не секретність ключа.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './database.types'

const url = import.meta.env['VITE_SUPABASE_URL']
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY']

if (!url || !anonKey) {
  throw new Error(
    'Не задані VITE_SUPABASE_URL і VITE_SUPABASE_ANON_KEY. Скопіюй .env.example у web/.env',
  )
}

export type Db = SupabaseClient<Database>

export const supabase: Db = createClient<Database>(url, anonKey, {
  auth: {
    // Сесія переживає перезавантаження, токен оновлюється сам — саме те,
    // що в PLAN.md стояло окремою задачею на «після MVP».
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

export type AttemptRow = Database['public']['Tables']['attempts']['Row']
export type AttemptInsert = Database['public']['Tables']['attempts']['Insert']
