// Created by farsi-mock. Edit freely: `npx farsi-mock frontend openapi.json -o src/mocks` only rewrites spec.ts and types.ts.
import { createMockRuntime } from "farsi-mock/frontend/runtime";
import { spec } from "./spec";
import type { Endpoints } from "./types";

export * from "./types";
export const api = createMockRuntime<Endpoints>(spec, {
  id: "example-bookstore-api",
  seed: 1,
  // delay: [150, 600],           // realistic latency
  // persist: true,               // keep created/edited records in localStorage
  // errors: { "GET /products": { status: 500, rate: 0.1 } },
  // handlers: { "GET /me": ({ f }) => ({ data: { fullName: f.person().fullName } }) },
});
export default api;
