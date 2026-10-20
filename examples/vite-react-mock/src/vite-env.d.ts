/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_MODE?: "api" | "mock" | "hybrid";
  readonly VITE_API_URL?: string;
}
