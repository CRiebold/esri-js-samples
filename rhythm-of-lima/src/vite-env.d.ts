/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_LAYER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
