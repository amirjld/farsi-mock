// Option B: mock on the server (BFF style). The browser calls /api/...; in mock mode this route answers
// from src/mocks with one data set per browser (cookie session), otherwise it proxies to the real backend.
import { createNextRouteHandlers } from "farsi-mock/frontend/client";

const MODE = process.env.API_MODE ?? process.env.NEXT_PUBLIC_API_MODE ?? "api";
const UPSTREAM = process.env.API_URL ?? "https://api.example.com";

const mock = createNextRouteHandlers(() => import("@/mocks"), { mount: "/api", session: true });

async function proxy(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target = UPSTREAM + url.pathname.replace(/^\/api/, "") + url.search;
  const init: RequestInit & { duplex?: "half" } = { method: req.method, headers: req.headers, body: req.body, duplex: "half" };
  if (req.method === "GET" || req.method === "HEAD") delete init.body;
  return fetch(target, init);
}

const pick = (m: keyof typeof mock) => (MODE === "mock" ? mock[m] : proxy);
export const GET = pick("GET");
export const POST = pick("POST");
export const PUT = pick("PUT");
export const PATCH = pick("PATCH");
export const DELETE = pick("DELETE");
export const dynamic = "force-dynamic";
