import { defineConfig } from 'vitest/config'

/**
 * Інтеграційні тести проти локального стека Supabase.
 * Окремий конфіг, бо вони вимагають Docker — юніт-тести engine мають
 * лишатись такими, що ганяються будь-де без нього.
 */
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    environment: 'node',
    // Тести ділять одну базу: паралельний прогін файлів зробив би їх нестабільними.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
