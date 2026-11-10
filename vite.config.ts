import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA, type ManifestOptions } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Serves the same-origin feed proxy at /api/proxy in dev and preview, using the
 * web-standard handler shared with the Cloudflare/Vercel functions.
 */
function ohProxyPlugin(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const origin = `http://${req.headers.host ?? 'localhost'}`
    let pathname: string
    try {
      pathname = new URL(req.url ?? '/', origin).pathname
    } catch {
      return next()
    }
    if (pathname !== '/api/proxy') return next()
    void (async () => {
      try {
        const [{ handleProxy }, { toWebRequest, sendWebResponse }] = await Promise.all([
          import('./server/proxyHandler.mjs'),
          import('./server/nodeAdapter.mjs'),
        ])
        await sendWebResponse(res, await handleProxy(toWebRequest(req, origin)))
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
        }
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      }
    })()
  }
  return {
    name: 'oh-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

/** Public base path: '/' locally, '/OpenHorizon/' for the GitHub Pages build (VITE_BASE). */
const base = process.env.VITE_BASE ?? '/'

/**
 * Installed-app integration (Web App Manifest members beyond the plugin's typed subset). Every URL is
 * built from `base` and resolves inside the scope. Browser support differs: see README "Installing & OS integration".
 *
 * protocol_handlers cannot register `feed:` (browsers reject it); feed:// text is unwrapped inside the app.
 * No extra icon entries: public/icons has only the 192 and 512 PNGs, and the 512 already declares "any maskable".
 */
const shortcutIcons = [{ src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' }]

const installIntegration = {
  id: base,
  categories: ['news', 'productivity'],
  lang: 'en',
  dir: 'auto',
  display_override: ['window-controls-overlay', 'standalone'],
  share_target: {
    action: base,
    method: 'GET',
    params: { title: 'title', text: 'text', url: 'url' },
  },
  shortcuts: [
    {
      name: 'Add feed',
      short_name: 'Add feed',
      description: 'Subscribe to a feed by its address',
      url: `${base}?action=add`,
      icons: shortcutIcons,
    },
    {
      name: 'Unread',
      short_name: 'Unread',
      description: 'Show unread articles',
      url: `${base}?view=unread`,
      icons: shortcutIcons,
    },
    {
      name: 'Favorites',
      short_name: 'Favorites',
      description: 'Show favorite articles',
      url: `${base}?view=favorites`,
      icons: shortcutIcons,
    },
  ],
  file_handlers: [
    {
      action: base,
      accept: {
        'text/x-opml': ['.opml'],
        'text/xml': ['.opml', '.xml'],
        'application/xml': ['.opml', '.xml'],
      },
      name: 'OPML subscriptions',
    },
  ],
  launch_handler: { client_mode: ['focus-existing', 'auto'] },
  protocol_handlers: [{ protocol: 'web+rss', url: `${base}?feed=%s` }],
}

// https://vite.dev/config/
export default defineConfig({
  base,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
  plugins: [
    react(),
    tailwindcss(),
    ohProxyPlugin(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'OpenHorizon',
        short_name: 'OpenHorizon',
        description: 'A modern metallic RSS reader',
        theme_color: '#0F1115',
        background_color: '#0F1115',
        display: 'standalone',
        start_url: base,
        scope: base,
        ...(installIntegration as Partial<ManifestOptions>),
        icons: [
          {
            src: `${base}icons/icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${base}icons/icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
