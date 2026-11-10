import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
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
