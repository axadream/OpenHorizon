/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_CORS_PROXY?: string
  readonly VITE_DISABLE_LOCAL_PROXY?: string
}

/*
 * Launch Handler API (Chromium, installed PWAs). Minimal typings: the consumer receives the files
 * of a file-handler launch (manifest file_handlers). Feature-detect with `window.launchQueue?.`.
 */
interface OhLaunchParams {
  readonly files: readonly FileSystemFileHandle[]
  readonly targetURL?: string
}

interface OhLaunchQueue {
  setConsumer(consumer: (params: OhLaunchParams) => void | Promise<void>): void
}

interface Window {
  launchQueue?: OhLaunchQueue
}
