// axios flavour: the same switch as an axios adapter (farsi-mock does not depend on axios).
import axios from "axios";
import { apiMode, createAxiosAdapter } from "farsi-mock/frontend/client";

const mode = apiMode(import.meta.env.VITE_API_MODE);

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  ...(mode !== "api" && {
    adapter: createAxiosAdapter(() => import("./mocks"), {
      mode,                                          // "mock" or "hybrid"
      fallback: axios.getAdapter(["xhr", "fetch"]),  // the real adapter, for hybrid and unmatched URLs
    }),
  }),
});
