/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_LIVEKIT_URL?: string;
  readonly VITE_APPLE_SIGN_IN_ENABLED?: string;
  readonly VITE_EMAIL_CONFIGURED?: string;
  readonly VITE_ENGAGEMENT_HUB_ENABLED?: string;
  readonly VITE_DEV_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ElixRuntimeEnv {
  VITE_API_URL?: string;
  VITE_WS_URL?: string;
  VITE_LIVEKIT_URL?: string;
  VITE_APPLE_SIGN_IN_ENABLED?: string;
  VITE_EMAIL_CONFIGURED?: string;
  VITE_ENGAGEMENT_HUB_ENABLED?: string;
}

interface Window {
  __ELIX_ENV?: ElixRuntimeEnv;
}
