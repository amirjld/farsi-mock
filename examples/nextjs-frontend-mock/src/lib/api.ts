import { createApiFetch } from "farsi-mock/frontend/client";
import type { Endpoints } from "@/mocks/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

// In "api" mode this is plain fetch and src/mocks is never downloaded (it is a lazy import).
export const apiFetch = createApiFetch({
  mode: process.env.NEXT_PUBLIC_API_MODE,
  mock: () => import("@/mocks"),
});

export async function get<K extends keyof Endpoints & `GET ${string}`>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<Endpoints[K]["response"]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") qs.set(k, String(v));
  const search = qs.toString();
  const res = await apiFetch(`${BASE}${path}${search ? `?${search}` : ""}`);
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? res.statusText);
  return res.json();
}
