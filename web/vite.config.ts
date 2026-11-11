/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Рішення і їхні причини: docs/superpowers/specs/2026-11-10-pwa-design.md
    VitePWA({
      // Новий SW ставиться сам (skipWaiting + clientsClaim), а сторінку не
      // перезавантажує: нова версія з'являється при наступному відкритті,
      // тож роздачу посеред рішення не обірве.
      registerType: 'autoUpdate',
      // Іконки й так ловить globPatterns нижче; інакше вони в precache двічі.
      includeManifestIcons: false,
      manifest: {
        name: 'Покер-тренажер · кеш 9-max і 6-max',
        short_name: 'Покер',
        description: 'Тренажер префлопу й постфлопу кешу 9-max і 6-max',
        lang: 'uk',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b0e12',
        theme_color: '#0b0e12',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // Supabase — інший origin, Workbox його не чіпає: синк і статистика
        // завжди йдуть у мережу. Кешуємо лише шрифти, інакше офлайн буде системний.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
    },
  },
})
