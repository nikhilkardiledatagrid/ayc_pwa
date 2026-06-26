import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Venue-theme fonts (fonts.css) are served from the backend public root at
  // /fonts/*. Derive that origin by stripping the /api/v1 suffix off the API
  // base so dev requests to /fonts proxy through to Laravel (avoids CORS).
  const fontsOrigin = (env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1')
    .replace(/\/api\/v1\/?$/, '')

  return {
    // GitHub Pages serves this project repo under /ayc_pwa/ (not the domain
    // root), so every built asset/route must be prefixed with that path. If you
    // later attach a custom domain (served from /), change this back to '/'.
    base: '/ayc_pwa/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // devOptions.navigateFallbackAllowlist is a SEPARATE setting from
        // workbox.navigateFallback below — vite-plugin-pwa's dev-mode SW
        // generation defaults it to [/^\/$/] (root only) regardless of the
        // production workbox config, so the offline deep-link fallback below
        // would otherwise only work in a production build, never in `npm run
        // dev`. Verified by inspecting node_modules/vite-plugin-pwa/dist/index.js
        // (the `options.devOptions.navigateFallbackAllowlist ?? [/^\/$/]` line)
        // after a real browser test showed a hard reload on /wifi while offline
        // hitting Chrome's native error page instead of the cached app shell.
        devOptions: { enabled: true, navigateFallbackAllowlist: [/^\/.*$/] },
        manifest: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // vite-plugin-pwa's default NavigationRoute only allowlists the exact
          // root path "/" — any other app route (e.g. /wifi, /menu, /cart)
          // falls through to a real network request on a hard reload, so a
          // WebView reload while offline on a deep path hits the browser's own
          // error page instead of the cached app shell. navigateFallback widens
          // that to every route; the denylist keeps actual API calls from ever
          // being served the HTML shell.
          navigateFallback: '/ayc_pwa/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          // Menu item images are venue-uploaded and served at runtime (not part
          // of the build), so they need a runtime rule rather than globPatterns.
          // CacheFirst: once cached, served instantly with no network round-trip —
          // offlineCache.js's primeImageCache() warms this on every menu load.
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'ayc-menu-images',
                expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    server: {
      host: '0.0.0.0',
      allowedHosts: [
        'pwa-aycqa.datagrid.co.in'
      ],
      historyApiFallback: true,
      proxy: {
        '/fonts': {
          target: fontsOrigin,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/tests/setup.js'],
      globals: true,
      css: false,
      isolate: false,
      reporters: ['verbose', ['json', { outputFile: './testcases_report/_raw.json' }]],
    },
  }
})
