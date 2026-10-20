// farsi-mock/frontend/runtime: everything needed at runtime for a pre-compiled spec (no OpenAPI parser, no inference).
export { createMockRuntime, MockHttpError, projectToFields } from "./runtime.js";
export type { MockApi, MockApiOptions, MockContext, MockHandler, MockReply, ErrorRule, StorageLike } from "./runtime.js";
export { defineMockSpec, templateShape, ENVELOPES } from "./routes.js";
export type { RoutesSpecInput, ResourceDef, RouteDef, EnvelopeTemplate, EnvelopePreset } from "./routes.js";
export {
  apiMode, isMockMode, createMockFetch, createApiFetch, installMockFetch, createAxiosAdapter, createMswHandlers,
  createNextRouteHandlers, createMockMiddleware, toFetchResponse, isEmptyPayload, defaultHybridFallback, combineMockApis, sessionStore,
} from "./adapters.js";
export type { ApiMode, MockSource, MockFetchOptions, AxiosLikeAdapter, AxiosLikeConfig, AxiosLikeResponse, MswHttpLike, HybridInfo, SessionOptions } from "./adapters.js";
export type { MockSpec, MockRoute, MockResource, MockRequest, MockResponse, Shape, MetaRole, QueryRoles, RouteKind, HttpMethod, EndpointMap } from "./types.js";
