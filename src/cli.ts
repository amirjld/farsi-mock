import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Iran } from "./iran.js";
import { Schema, fromJson, listPaths, type SchemaDef, type ContextOptions, type KeyCase, type DatasetCount, type SchemaOptions } from "./schema.js";
import { format, toSql, toTs, toMongoJson, type Format, type SqlDialect } from "./output.js";
import { createMockServer } from "./server.js";
import { detectSource, type InferSource, type InferredSchema } from "./infer/index.js";
import { VERSION } from "./version.js";

const HELP = `farsi-mock ${VERSION}: realistic, valid Iranian test data

Usage
  farsi-mock <type> [options]          type: user, seller, address, product, order (presets)
                                             person, contact, bank, company, plate (raw generators)
  farsi-mock schema <file.json>        generate from a schema file
  farsi-mock infer <file>              infer a schema from Prisma, OpenAPI, JSON Schema, a sample JSON,
                                       or a .js/.mjs module exporting a zod / mongoose schema
  farsi-mock serve <file> [--port n]   mock REST API (schema file or anything infer accepts)
  farsi-mock mcp                       MCP server over stdio (tools for AI assistants)
  farsi-mock paths                     every field path usable in schemas
  farsi-mock banks | provinces | categories | holidays [jalali-year]

Output
  -n, --count <n>          records (default 10; per entity for datasets unless the file says otherwise)
  -f, --format <fmt>       json | jsonl | csv | sql | mongo | ts (default json)
      --csv, --jsonl, --sql, --mongo, --ts   shortcuts
  -o, --out <file>         write to a file (CSV/mongo with several entities: prefix, one file each)
      --dialect <d>        sql: postgres | mysql | sqlite (default postgres)
      --table <name>       sql: table name for a single record list
      --create-table       sql: add CREATE TABLE IF NOT EXISTS
      --ignore-conflicts   sql: ON CONFLICT DO NOTHING / INSERT IGNORE / INSERT OR IGNORE
      --batch-size <n>     sql: rows per INSERT (default 500)
      --bom                CSV with UTF-8 BOM (for Excel)
      --compact            single-line JSON

Data
  -s, --seed <seed>        deterministic output
  -p, --province <name>    Persian/English name or ISO code (اصفهان, Isfahan, IR-10)
      --gender <g>         male | female
      --operator <op>      MCI | Irancell | Rightel
      --case <case>        preserve | camel | snake | pascal | kebab
      --digits <d>         fa | latin (digits in text values)
      --ref-date <iso>     fixed "now"
      --realistic-ids      national IDs with real city prefixes (default: safe 000 prefix)

Infer
      --from <kind>        zod | jsonschema | openapi | prisma | mongoose | sample (default: detect)
      --model <names>      only these models (comma separated)
      --export <name>      export to use from a .js module (default: default export)
      --override f=path    force a generator, repeatable (e.g. --override User.code=person.nationalId)
      --overrides <file>   JSON file of overrides
      --null-rate <0-1>    nulls for nullable fields (default 0)
      --explain            print the mapping report with confidence (to stderr)
      --write <file>       save the inferred schema file
      --generate           generate data instead of printing the schema

Serve
      --port <n>           default 3000      --host <h>     default 127.0.0.1
      --base <path>        URL prefix (/api) --page-size <n> default 20
      --writable           allow POST/PUT/PATCH/DELETE (in memory)
      --delay <ms>         artificial latency

Examples
  npx farsi-mock person -n 50 --csv
  npx farsi-mock user -n 100 --seed 42 --province اصفهان --case snake --sql --table users
  npx farsi-mock infer prisma/schema.prisma --explain --write farsi-mock.json
  npx farsi-mock infer prisma/schema.prisma --generate -n 20 --sql --dialect postgres
  npx farsi-mock serve farsi-mock.json --port 4000 --seed 1
`;

interface Args { _: string[]; [k: string]: string | boolean | string[] }
const FLAGS = new Set(["csv", "jsonl", "json", "sql", "mongo", "ts", "bom", "compact", "help", "version", "realistic-ids", "create-table", "ignore-conflicts", "explain", "generate", "writable"]);
const MULTI = new Set(["override"]);
function parse(argv: string[]): Args {
  const a: Args = { _: [] };
  const alias: Record<string, string> = { n: "count", f: "format", s: "seed", p: "province", o: "out", h: "help", v: "version" };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("-") && t !== "-" && !/^-\d/.test(t)) {
      let [k, v] = t.replace(/^-+/, "").split(/=(.*)/s);
      k = alias[k] ?? k;
      if (FLAGS.has(k)) a[k] = true;
      else {
        if (v === undefined) v = argv[++i];
        if (v === undefined) fail(`missing value for --${k}`);
        if (MULTI.has(k)) a[k] = [...((a[k] as string[]) ?? []), v]; else a[k] = v;
      }
    } else a._.push(t);
  }
  return a;
}
function fail(msg: string): never { process.stderr.write(`farsi-mock: ${msg}\nRun farsi-mock --help for usage.\n`); process.exit(1); }
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
function num(v: unknown, name: string, min = 0): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) fail(`--${name} must be a number >= ${min}`);
  return n;
}

async function main(argv: string[]) {
  const a = parse(argv);
  if (a.version) return out(VERSION + "\n");
  const cmd = a._[0];
  if (a.help || !cmd) return out(HELP);
  if (cmd === "mcp") { const { serveMcpStdio } = await import("./ai.js"); serveMcpStdio(); return; }
  const seed = str(a.seed);
  const f = new Iran({ seed: seed === undefined ? undefined : /^\d+$/.test(seed) ? Number(seed) : seed, referenceDate: str(a["ref-date"]), realisticIds: Boolean(a["realistic-ids"]) });
  if (cmd === "paths") return out(Object.entries(listPaths(f)).map(([g, p]) => `${g}:\n  ${p.join("\n  ")}`).join("\n") + "\n");
  if (cmd === "banks") return out(f.banks().map((b) => `${b.id}\t${b.name}\t${b.nameEn}`).join("\n") + "\n");
  if (cmd === "provinces") return out(f.provinces().map((p) => `${p.iso}\t${p.name}\t${p.nameEn}\t${p.areaCode}`).join("\n") + "\n");
  if (cmd === "categories") return out(f.categories().map((c) => `${c.id}\t${c.name}\t${c.nameEn}`).join("\n") + "\n");
  if (cmd === "holidays") return out(f.jalali.holidays(a._[1] ? Number(a._[1]) : undefined).map((h) => `${h.jalali}\t${h.gregorian}\t${h.weekday}\t${h.name}`).join("\n") + "\n");

  const countArg = a.count === undefined ? undefined : num(a.count, "count");
  if (countArg !== undefined && !Number.isInteger(countArg)) fail("--count must be a non-negative integer");
  const count = countArg ?? 10;
  const fmt = (a.csv ? "csv" : a.jsonl ? "jsonl" : a.sql ? "sql" : a.mongo ? "mongo" : a.ts ? "ts" : a.json ? "json" : str(a.format) ?? "json") as Format;
  if (!["json", "csv", "jsonl", "sql", "mongo", "ts"].includes(fmt)) fail(`unknown format "${fmt}"`);
  const ctx: ContextOptions = strip({ province: str(a.province), gender: str(a.gender) as ContextOptions["gender"], operator: str(a.operator) as ContextOptions["operator"], realisticIds: Boolean(a["realistic-ids"]) || undefined });
  if (ctx.gender && ctx.gender !== "male" && ctx.gender !== "female") fail("--gender must be male or female");
  const keyCase = (str(a.case) as KeyCase) ?? "preserve";
  if (!["preserve", "camel", "snake", "pascal", "kebab"].includes(keyCase)) fail(`unknown --case "${keyCase}"`);
  const digits = str(a.digits) as SchemaOptions["digits"];
  if (digits && digits !== "fa" && digits !== "latin") fail("--digits must be fa or latin");
  const schemaOpts = (extra: ContextOptions = {}): SchemaOptions => strip({ context: { ...extra, ...ctx }, case: keyCase, digits });

  let result: Record<string, unknown>[] | Record<string, Record<string, unknown>[]>;
  if (cmd === "schema") {
    const json = readJson(a._[1] ?? fail("schema needs a file: farsi-mock schema ./schema.json"));
    result = runSchemaFile(f, json, schemaOpts, countArg, count);
  } else if (cmd === "infer") {
    const inferred = await inferFile(f, a, a._[1] ?? fail("infer needs a file: farsi-mock infer prisma/schema.prisma"));
    if (a.explain) process.stderr.write(inferred.explain() + "\n");
    const file = inferred.toJSON(count);
    if (a.write) { writeFileSync(String(a.write), JSON.stringify(file, null, 2) + "\n"); process.stderr.write(`wrote ${a.write}\n`); }
    if (!a.generate) { if (!a.write) out(JSON.stringify(file, null, 2) + "\n"); return; }
    result = runSchemaFile(f, file, schemaOpts, countArg, count);
  } else if (cmd === "serve") {
    const file = a._[1] ?? fail("serve needs a file: farsi-mock serve schema.json");
    const json = isSchemaFile(file) ? readJson(file) : (await inferFile(f, a, file)).toJSON(count);
    const resources = json.entities ? (json.entities as Record<string, { fields: unknown; count?: DatasetCount }>)
      : { [str(a.name) ?? basename(file, extname(file)).replace(/[^\w-]/g, "") ?? "items"]: { fields: json.fields ?? json, count: (json.count as number) ?? count } };
    if (countArg !== undefined) for (const r of Object.values(resources)) r.count = countArg;
    const delay = num(a.delay, "delay");
    const mock = createMockServer({
      iran: f, resources, count, basePath: str(a.base), pageSize: num(a["page-size"], "page-size", 1), writable: Boolean(a.writable), delay,
      onRequest: (r) => process.stderr.write(`${r.method} ${r.url} ${r.status} ${r.ms}ms\n`),
    });
    const url = await mock.listen(num(a.port, "port") ?? 3000, str(a.host) ?? "127.0.0.1");
    process.stderr.write(`farsi-mock mock API on ${url}\n${Object.entries(mock.data).map(([k, v]) => `  ${url}/${k}  (${v.length})`).join("\n")}\n  try: ${url}/${Object.keys(mock.data)[0]}?page=1&limit=5\n`);
    const stop = () => { void mock.close().then(() => process.exit(0)); };
    process.on("SIGINT", stop); process.on("SIGTERM", stop);
    return;
  } else {
    const presets = f.presets as Record<string, Schema>;
    const raw: Record<string, () => object> = {
      person: () => f.person({ province: ctx.province, gender: ctx.gender, realisticIds: ctx.realisticIds }),
      contact: () => f.contact({ province: ctx.province, operator: ctx.operator }),
      bank: () => f.bank(),
      company: () => f.company({ province: ctx.province }),
      plate: () => f.plate(),
    };
    if (presets[cmd]) result = presets[cmd].withOptions(strip({ case: keyCase, digits })).many(count, ctx);
    else if (raw[cmd]) result = new Schema(f, { _: () => raw[cmd]() }, strip({ case: keyCase, digits })).many(count).map((r) => r._ as Record<string, unknown>);
    else fail(`unknown command "${cmd}". Try: user, seller, address, product, order, person, contact, bank, company, plate, schema, infer, serve`);
  }
  emit(a, fmt, result, cmd);
}

function emit(a: Args, fmt: Format, result: Record<string, unknown>[] | Record<string, Record<string, unknown>[]>, cmd: string) {
  const sqlOpts = { dialect: (str(a.dialect) ?? "postgres") as SqlDialect, table: str(a.table) ?? (Array.isArray(result) ? cmd.replace(/\W/g, "_") : undefined), createTable: Boolean(a["create-table"]), ignoreConflicts: Boolean(a["ignore-conflicts"]), batchSize: num(a["batch-size"], "batch-size", 1) };
  let text: string;
  if (Array.isArray(result)) text = format(result, fmt, { bom: Boolean(a.bom), pretty: !a.compact, ...sqlOpts, name: cmd === "schema" || cmd === "infer" ? "records" : cmd });
  else if (fmt === "json") text = JSON.stringify(result, null, a.compact ? 0 : 2) + "\n";
  else if (fmt === "jsonl") text = Object.entries(result).flatMap(([entity, rows]) => rows.map((r) => JSON.stringify({ entity, ...r }))).join("\n") + "\n";
  else if (fmt === "sql") text = toSql(result, sqlOpts);
  else if (fmt === "ts") text = toTs(result);
  else {
    if (!a.out) {
      if (fmt === "mongo") { text = "{\n" + Object.entries(result).map(([k, rows]) => `${JSON.stringify(k)}: ${toMongoJson(rows).trim()}`).join(",\n") + "\n}\n"; out(text); return; }
      fail("several entities with --format csv need --out <prefix>; one file per entity is written as <prefix>.<entity>.csv");
    }
    const ext = fmt === "csv" ? "csv" : "json";
    for (const [entity, rows] of Object.entries(result)) writeFileSync(`${String(a.out).replace(/\.(csv|json)$/i, "")}.${entity}.${ext}`, fmt === "csv" ? format(rows, "csv", { bom: Boolean(a.bom) }) : toMongoJson(rows));
    process.stderr.write(`wrote ${Object.keys(result).length} ${ext.toUpperCase()} files\n`);
    return;
  }
  if (a.out) { writeFileSync(String(a.out), text); process.stderr.write(`wrote ${a.out}\n`); }
  else out(text);
}

function readJson(file: string): Record<string, unknown> {
  try { return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch (e) { fail(`cannot read ${file}: ${(e as Error).message}`); }
}
function isSchemaFile(file: string): boolean {
  if (extname(file).toLowerCase() !== ".json") return false;
  const j = readJson(file);
  return !!(j.entities || (j.fields && typeof j.fields === "object")) || Object.values(j).every((v) => typeof v === "string" && /^(ref:)?[a-z]+\.[A-Za-z.]+$/.test(v));
}

function runSchemaFile(f: Iran, json: Record<string, unknown>, opts: (c?: ContextOptions) => SchemaOptions, countArg: number | undefined, count: number) {
  const top: SchemaOptions = strip({ digits: json.digits as SchemaOptions["digits"], case: json.case as KeyCase | undefined });
  if (json.entities && typeof json.entities === "object") {
    const spec = Object.fromEntries(Object.entries(json.entities as Record<string, Record<string, unknown>>).map(([name, e]) => {
      const o = opts(e.context as ContextOptions);
      return [name, {
        schema: new Schema(f, fromJson(f, e.fields ?? e) as SchemaDef, { ...top, ...strip(o), ...(e.uniqueBy ? { uniqueBy: e.uniqueBy as string[] } : {}) }),
        count: (typeof e.count === "object" && e.count ? e.count : countArg ?? (e.count as number | undefined) ?? count) as DatasetCount,
      }];
    }));
    return f.dataset(spec) as Record<string, Record<string, unknown>[]>;
  }
  const fields = (json.fields ?? json) as unknown;
  const s = new Schema(f, fromJson(f, fields) as SchemaDef, { ...top, ...strip(opts(json.context as ContextOptions)), ...(json.uniqueBy ? { uniqueBy: json.uniqueBy as string[] } : {}) });
  return s.many(countArg ?? (json.fields && typeof json.count === "number" ? json.count : count));
}

async function inferFile(f: Iran, a: Args, file: string): Promise<InferredSchema> {
  const ext = extname(file).toLowerCase();
  const overrides: Record<string, unknown> = a.overrides ? readJson(String(a.overrides)) : {};
  for (const o of (a.override as string[] | undefined) ?? []) {
    const i = o.indexOf("=");
    if (i < 1) fail(`--override expects field=generator, got "${o}"`);
    const v = o.slice(i + 1);
    overrides[o.slice(0, i)] = /^[{["\d]/.test(v) ? JSON.parse(v) : v;
  }
  const opts = strip({
    from: str(a.from) as InferSource | undefined, model: str(a.model), name: str(a.name), overrides: overrides as Record<string, string>,
    nullRate: num(a["null-rate"], "null-rate"), schemaOptions: undefined,
  });
  if (opts.from && !["zod", "jsonschema", "openapi", "prisma", "mongoose", "sample"].includes(opts.from)) fail(`unknown --from "${opts.from}"`);
  let input: unknown;
  if ([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"].includes(ext)) {
    let mod: Record<string, unknown>;
    try { mod = await import(pathToFileURL(resolve(file)).href); }
    catch (e) { fail(`cannot import ${file}: ${(e as Error).message}${ext.endsWith("ts") ? "\nTypeScript modules need a loader: run with `npx tsx $(which farsi-mock) ...` or Node >= 22.6 --experimental-strip-types, or compile to .js first." : ""}`); }
    const exp = str(a.export);
    input = exp ? mod[exp] : mod.default ?? Object.values(mod).find((v) => v && typeof v === "object");
    if (input === undefined) fail(`${file} has no ${exp ? `export "${exp}"` : "default export"}`);
    if (!opts.name) opts.name = exp ?? basename(file, ext);
  } else if (ext === ".yaml" || ext === ".yml") {
    fail("YAML is not supported without dependencies. Convert to JSON first, e.g. npx js-yaml openapi.yaml > openapi.json");
  } else {
    const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    input = ext === ".prisma" ? text : (() => { try { return JSON.parse(text); } catch (e) { fail(`${file} is not valid JSON: ${(e as Error).message}`); } })();
    if (!opts.name && opts.from !== "prisma" && ext !== ".prisma") opts.name = basename(file, ext);
  }
  const from = opts.from ?? detectSource(input);
  return f.infer(input, { ...opts, from });
}

function strip<T extends object>(o: T): T { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T; }
function out(s: string) { process.stdout.write(s); }

main(process.argv.slice(2)).catch((e) => fail((e as Error).message));
