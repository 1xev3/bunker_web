/// <reference types="vite/client" />

// Внедряются через `define` в vite.config.ts на этапе сборки
declare const __APP_VERSION__: string
declare const __GIT_HASH__: string
declare const __BUILD_DATE__: string
