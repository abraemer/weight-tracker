import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import type { Preset } from '@vite-pwa/assets-generator/config'

const pwaPreset: Preset = {
  transparent: {
    sizes: [64, 192, 512],
    favicons: [[48, 'favicon.ico']],
    padding: 0,
    resizeOptions: { background: '#5BB4E0', fit: 'contain' },
  },
  maskable: {
    sizes: [512],
    padding: 0.3,
    resizeOptions: { background: '#5BB4E0', fit: 'contain' },
  },
  apple: {
    sizes: [180],
    padding: 0,
    resizeOptions: { background: '#5BB4E0', fit: 'contain' },
  },
}

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    VitePWA({
      registerType: 'autoUpdate',
      pwaAssets: {
        preset: pwaPreset,
        image: 'public/logo.svg',
        overrideManifestIcons: false,
      },
      manifest: {
        name: 'Weight Tracker',
        short_name: 'Weight',
        description: 'Track your weight over time',
        theme_color: '#5BB4E0',
        background_color: '#5BB4E0',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    {
      name: 'build-time',
      transformIndexHtml(html) {
        return html.replace('</body>', `<script>window.__BUILD_TIME__ = "${new Date().toISOString()}"</script></body>`)
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/frontend', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/frontend',
    emptyOutDir: true,
  },
})
