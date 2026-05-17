/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAOMI_AGENT_APP_VERSION?: string
  readonly VITE_MAOMI_AGENT_UPDATE_AUTO_CHECK?: string
  readonly VITE_MAOMI_AGENT_UPDATE_CHANNEL?: string
  readonly VITE_MAOMI_AGENT_UPDATE_ENDPOINT?: string
  readonly VITE_MAOMI_AGENT_UPDATER_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}