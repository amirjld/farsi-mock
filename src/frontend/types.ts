// Compiled, JSON-serializable mock spec. Produced from OpenAPI/Swagger (compileOpenAPI), from hand-written
// routes (defineRoutes), or loaded from a snapshot written by `farsi-mock frontend`. The runtime only needs this.
import type { JsonGen } from "../infer/mapper.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/** Pagination/meta value computed at request time. */
export type MetaRole =
  | "total" | "page" | "pageSize" | "pages" | "count" | "offset"
  | "hasNext" | "hasPrev" | "next" | "prev" | "first" | "last" | "empty"
  /** HTTP status, status text ("OK", "NOT_FOUND"), a human message (Persian), and Date.now(). */
  | "status" | "statusText" | "message" | "epoch"
  /** true for 2xx/3xx, false for errors. */
  | "ok";

/** Response shape tree. */
export type Shape =
  | { t: "object"; props: Record<string, Shape>; optional?: string[] }
  | { t: "array"; of: Shape; min?: number; max?: number }
  /** Paginated, filtered, sorted list of a resource (the list "items"). `pick`: keys of this view. */
  | { t: "items"; resource: string; pick?: string[]; view?: Record<string, JsonGen> }
  /** One record of a resource (detail / created / updated). */
  | { t: "record"; resource: string; pick?: string[]; view?: Record<string, JsonGen> }
  | { t: "meta"; role: MetaRole; as?: "string" | "number" | "boolean" }
  | { t: "const"; value: unknown }
  /** Request-time "now" as ISO string. */
  | { t: "now" }
  /** Any farsi-mock JSON generator (path string, { $int }, nested object, ...). */
  | { t: "gen"; gen: JsonGen }
  | { t: "nullable"; of: Shape };

export type RouteKind = "list" | "detail" | "create" | "update" | "delete" | "other";

export interface QueryRoles {
  page?: string;
  pageSize?: string;
  offset?: string;
  search?: string;
  sort?: string;
  order?: string;
  /** 0 when the API counts pages from 0 (Spring), default 1. */
  pageBase?: 0 | 1;
  /** Default page size declared by the API. */
  defaultPageSize?: number;
  /** Query params that filter by a field: param name -> field (dot path) and operator. */
  filters?: Record<string, { field: string; op?: "eq" | "ne" | "gte" | "lte" | "like" | "in" }>;
}

export interface MockRoute {
  method: HttpMethod;
  /** OpenAPI-style path with {params}, relative to the spec's basePath. */
  path: string;
  operationId?: string;
  kind: RouteKind;
  resource?: string;
  /** Path param -> resource field. The last param of a detail route selects the record; earlier ones filter nested lists. */
  params?: Record<string, string>;
  /** Success status (200, 201, 204, ...). */
  status: number;
  /** Response body shape; omitted for empty bodies (204). */
  response?: Shape;
  /** Error bodies by status ("404", "4XX", "default"). */
  errors?: Record<string, Shape>;
  query?: QueryRoles;
}

export interface MockResource {
  /** Field generators (farsi-mock JSON generator format). */
  fields: Record<string, JsonGen>;
  /** Primary key field. */
  idField: string;
  /** "int" ids get max+1 on create, "uuid"/"objectId"/"string" get a generated value. */
  idType: "int" | "uuid" | "objectId" | "string";
  /** Default record count. */
  count?: number;
}

export interface MockSpec {
  /** Format version of this object. */
  farsiMockSpec: 1;
  title?: string;
  /** Path prefix of every route, e.g. "/api/v1" (from servers[0].url / basePath). */
  basePath: string;
  resources: Record<string, MockResource>;
  routes: MockRoute[];
}

export interface MockRequest {
  method?: string;
  /** Absolute URL or path with query string. */
  url: string;
  headers?: Record<string, string> | Headers | [string, string][];
  /** Parsed JSON body, a JSON string, FormData/URLSearchParams, or nothing. */
  body?: unknown;
}

export interface MockResponse<B = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: B;
  /** The matched route (undefined when nothing matched). */
  route?: MockRoute;
}

/**
 * Endpoint type map used to type requests: `"GET /products/{id}": { response: ...; body?: ...; query?: ... }`.
 * `farsi-mock frontend` writes one (`Endpoints`) next to the snapshot.
 */
export type EndpointMap = Record<string, { response: unknown; body?: unknown; query?: unknown; params?: unknown }>;
