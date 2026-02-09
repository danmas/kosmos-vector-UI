/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string
  readonly VITE_API_KEY: string
  readonly VITE_BACKEND_PORT: string
  readonly VITE_FILE_OPEN_MODE: 'window' | 'tab' | 'dialog'
  readonly VITE_SERVER_LOGS_OPEN_MODE: 'window' | 'tab' | 'dialog'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
