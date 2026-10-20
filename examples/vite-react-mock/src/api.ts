// fetch flavour: works for plain fetch, TanStack Query, SWR...
import { createApiFetch } from "farsi-mock/frontend/client";

export const API_URL = import.meta.env.VITE_API_URL ?? "";

export const apiFetch = createApiFetch({
  mode: import.meta.env.VITE_API_MODE,
  mock: () => import("./mocks"),           // lazy: not in the bundle when VITE_API_MODE=api
  // hybrid: use the mock when a GET returns an empty list/result or the backend is unreachable (auth routes excluded)
});

export async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(API_URL + path);
  const body = (await res.json()) as T & { isSuccess?: boolean; message?: string | null };
  if (!res.ok || body.isSuccess === false) throw new Error(body.message ?? res.statusText);
  return body;
}
