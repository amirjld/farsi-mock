// farsi-mock/frontend/client: only the API_MODE switch and the adapters. It never imports the mock runtime,
// so the app's main bundle stays small; the runtime comes in with the lazily imported mocks module.
export {
  apiMode, isMockMode, createMockFetch, createApiFetch, installMockFetch, createAxiosAdapter, createMswHandlers,
  createNextRouteHandlers, createMockMiddleware, toFetchResponse, isEmptyPayload, defaultHybridFallback, combineMockApis, sessionStore,
} from "./adapters.js";
export type { ApiMode, MockSource, MockFetchOptions, AxiosLikeAdapter, AxiosLikeConfig, AxiosLikeResponse, MswHttpLike, HybridInfo, SessionOptions } from "./adapters.js";
export type { MockApi } from "./runtime.js";
export type { MockRequest, MockResponse, EndpointMap } from "./types.js";
