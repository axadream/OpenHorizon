/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_CORS_PROXY?: string
  readonly VITE_DISABLE_LOCAL_PROXY?: string
}
