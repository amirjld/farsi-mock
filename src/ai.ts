// AI / MCP integration without dependencies: tool definitions (JSON Schema) + a dispatcher,
// and a minimal MCP stdio server (`farsi-mock mcp`). parsi-mcp or any MCP server can reuse
// `tools` and `callTool` directly.
import { Iran } from "./iran.js";
import { Schema, fromJson, listPaths, type SchemaDef } from "./schema.js";
import { format, toSql, toTs, type Format, type SqlDialect } from "./output.js";
import { validate, bankOfCard, bankOfSheba } from "./validate.js";
import { VERSION } from "./version.js";

export interface ToolDefinition { name: string; description: string; inputSchema: Record<string, unknown> }
export interface ToolResult { content: { type: "text"; text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> }

const MAX = 1000;
const common = {
  count: { type: "integer", minimum: 1, maximum: MAX, default: 10, description: "Number of records (max 1000)" },
  seed: { type: ["integer", "string"], description: "Seed for reproducible output" },
  format: { type: "string", enum: ["json", "csv", "jsonl", "sql", "ts", "mongo"], default: "json" },
  dialect: { type: "string", enum: ["postgres", "mysql", "sqlite"], description: "SQL dialect when format is sql" },
  table: { type: "string", description: "SQL table name" },
  realisticIds: { type: "boolean", description: "Use real city prefixes in national IDs (default false = safe 000 prefix)" },
};

export const tools: ToolDefinition[] = [
  {
    name: "farsi_mock_generate",
    description: "Generate realistic, algorithmically valid Iranian test data (people, contacts, bank accounts, companies, products, orders, addresses, plates). Synthetic only; national IDs use a safe 000 prefix by default.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["user", "seller", "address", "product", "order", "person", "contact", "bank", "company", "plate"], description: "What to generate" },
        province: { type: "string", description: "Province (Persian/English name or ISO code like IR-10)" },
        gender: { type: "string", enum: ["male", "female"] },
        ...common,
      },
      required: ["type"],
    },
  },
  {
    name: "farsi_mock_schema",
    description: "Generate records from a field map, e.g. {\"id\":\"id.uuid\",\"name\":\"person.fullName\",\"mobile\":\"contact.mobile\"}, or a dataset {\"entities\":{\"users\":{\"count\":5,\"fields\":{...}}}}. Use farsi_mock_paths to list paths.",
    inputSchema: { type: "object", properties: { schema: { type: "object", description: "Field map or { entities }" }, ...common }, required: ["schema"] },
  },
  {
    name: "farsi_mock_infer",
    description: "Infer a farsi-mock schema from a Prisma schema, OpenAPI/JSON Schema document, or sample JSON (as text), with a per-field confidence report. Optionally generate data right away.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "schema.prisma text, or JSON text (OpenAPI, JSON Schema, or sample records)" },
        from: { type: "string", enum: ["prisma", "openapi", "jsonschema", "sample"], description: "Input kind (default: detect)" },
        overrides: { type: "object", description: "field -> generator path, e.g. {\"User.code\":\"person.nationalId\"}" },
        generate: { type: "boolean", default: false, description: "Also generate data" },
        ...common,
      },
      required: ["input"],
    },
  },
  {
    name: "farsi_mock_validate",
    description: "Validate an Iranian identifier: national ID (کد ملی), bank card (Luhn), Sheba/IBAN, mobile, postal code, or company legal ID (شناسه ملی). Persian digits are accepted.",
    inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["nationalId", "cardNumber", "sheba", "mobile", "postalCode", "legalId"] }, value: { type: "string" } }, required: ["kind", "value"] },
  },
  {
    name: "farsi_mock_paths",
    description: "List every generator path usable in farsi-mock schemas (person.*, contact.*, bank.*, address.*, ...).",
    inputSchema: { type: "object", properties: {} },
  },
];

const text = (t: string, extra: Partial<ToolResult> = {}): ToolResult => ({ content: [{ type: "text", text: t }], ...extra });
const err = (t: string): ToolResult => text(t, { isError: true });

function render(data: Record<string, unknown>[] | Record<string, Record<string, unknown>[]>, args: Record<string, unknown>, table: string): string {
  const fmt = (args.format as Format) ?? "json";
  const sqlOpts = { dialect: (args.dialect as SqlDialect) ?? "postgres", table: (args.table as string) ?? table };
  if (Array.isArray(data)) return format(data, fmt, { ...sqlOpts, name: table });
  if (fmt === "sql") return toSql(data, sqlOpts);
  if (fmt === "ts") return toTs(data);
  return JSON.stringify(data, null, 2);
}

/** Run a tool by name. Never throws: errors come back as { isError: true }. */
export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  try {
    const count = Math.min(MAX, Math.max(1, Math.floor(Number(args.count ?? 10)) || 10));
    const f = new Iran({ seed: args.seed as number | string | undefined, realisticIds: args.realisticIds === true });
    switch (name) {
      case "farsi_mock_generate": {
        const type = String(args.type);
        const ctx = { province: args.province as string | undefined, gender: args.gender as "male" | "female" | undefined };
        const presets = f.presets as Record<string, Schema>;
        const raw: Record<string, () => object> = {
          person: () => f.person(ctx), contact: () => f.contact({ province: ctx.province }), bank: () => f.bank(),
          company: () => f.company({ province: ctx.province }), plate: () => f.plate(),
        };
        let rows: Record<string, unknown>[];
        if (presets[type]) rows = presets[type].many(count, Object.fromEntries(Object.entries(ctx).filter(([, v]) => v)));
        else if (raw[type]) rows = Array.from({ length: count }, () => raw[type]() as Record<string, unknown>);
        else return err(`unknown type "${type}"`);
        return text(render(rows, args, type));
      }
      case "farsi_mock_schema": {
        const schema = args.schema as Record<string, unknown>;
        if (!schema || typeof schema !== "object") return err("schema must be an object");
        if (schema.entities) {
          const spec = Object.fromEntries(Object.entries(schema.entities as Record<string, Record<string, unknown>>).map(([k, e]) => [k, {
            schema: new Schema(f, fromJson(f, e.fields ?? e) as SchemaDef),
            count: typeof e.count === "object" ? (e.count as never) : Math.min(MAX, Number(e.count ?? count)),
          }]));
          return text(render(f.dataset(spec) as Record<string, Record<string, unknown>[]>, args, "records"));
        }
        return text(render(new Schema(f, fromJson(f, schema.fields ?? schema) as SchemaDef).many(count), args, "records"));
      }
      case "farsi_mock_infer": {
        const input = String(args.input ?? "");
        if (!input.trim()) return err("input is empty");
        const r = f.infer(input, { from: args.from as never, overrides: args.overrides as never, count });
        const report = r.report.map((x) => ({ model: x.model, field: x.field, generator: x.generator, confidence: x.confidence, reason: x.reason }));
        if (!args.generate) return text(JSON.stringify({ schema: r.toJSON(count), averageConfidence: r.confidence, report }, null, 2), { structuredContent: { schema: r.toJSON(count), report } });
        const data = r.models.length > 1 ? r.dataset(count) : r.schema().many(count);
        return text(render(data, args, r.modelNames[0] ?? "records") + `\n\n-- inferred ${r.report.length} fields, average confidence ${Math.round(r.confidence * 100)}%`);
      }
      case "farsi_mock_validate": {
        const kind = String(args.kind) as keyof typeof validate;
        const value = String(args.value ?? "");
        if (!["nationalId", "cardNumber", "sheba", "mobile", "postalCode", "legalId"].includes(kind)) return err(`unknown kind "${kind}"`);
        const fn = validate[kind] as (v: string) => boolean;
        const valid = fn(value);
        const extra = valid && kind === "cardNumber" ? { bank: bankOfCard(value)?.en } : valid && kind === "sheba" ? { bank: bankOfSheba(value)?.en } : {};
        return text(JSON.stringify({ kind, valid, ...extra }), { structuredContent: { kind, valid, ...extra } });
      }
      case "farsi_mock_paths": return text(Object.entries(listPaths(f)).map(([g, p]) => `${g}: ${p.join(", ")}`).join("\n"));
      default: return err(`unknown tool "${name}"`);
    }
  } catch (e) { return err((e as Error).message); }
}

// ---------------------------------------------------------------- minimal MCP server (stdio, JSON-RPC 2.0)
interface RpcMessage { jsonrpc: "2.0"; id?: number | string | null; method?: string; params?: Record<string, unknown> }

/** Handle one MCP JSON-RPC message; returns the response (or undefined for notifications). */
export async function handleMcpMessage(msg: RpcMessage): Promise<Record<string, unknown> | undefined> {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  if (msg.id === undefined || msg.id === null) return undefined; // notification
  switch (msg.method) {
    case "initialize":
      return reply({
        protocolVersion: typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "farsi-mock", version: VERSION },
        instructions: "Synthetic Iranian test data. Use farsi_mock_generate for quick records, farsi_mock_schema for custom shapes, farsi_mock_infer to read an existing schema.",
      });
    case "ping": return reply({});
    case "tools/list": return reply({ tools });
    case "tools/call": {
      const p = msg.params ?? {};
      if (!tools.some((t) => t.name === p.name)) return fail(-32602, `Unknown tool: ${String(p.name)}`);
      return reply(await callTool(String(p.name), (p.arguments as Record<string, unknown>) ?? {}));
    }
    default: return fail(-32601, `Method not found: ${String(msg.method)}`);
  }
}

/** Run an MCP server over stdio (newline-delimited JSON-RPC). Used by `farsi-mock mcp`. */
export function serveMcpStdio(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): void {
  let buf = "";
  input.setEncoding?.("utf8");
  input.on("data", (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg: RpcMessage;
      try { msg = JSON.parse(line); } catch { output.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n"); continue; }
      void handleMcpMessage(msg).then((r) => { if (r) output.write(JSON.stringify(r) + "\n"); });
    }
  });
}
