import { readFileSync, writeFileSync } from "node:fs";
import { Iran } from "./iran.js";
import { Schema, fromJson, listPaths, type SchemaDef, type ContextOptions, type KeyCase } from "./schema.js";
import { format, type Format } from "./output.js";

const VERSION = "0.1.0";
const HELP = `mock-iran ${VERSION}: realistic, valid Iranian test data

Usage
  mock-iran <type> [options]          type: user, seller, address, product, order (presets)
                                            person, contact, bank, company (raw generators)
  mock-iran schema <file.json> [options]
  mock-iran paths                      list every field path usable in schemas
  mock-iran banks | provinces          list supported banks / provinces

Options
  -n, --count <n>        number of records (default 10)
  -f, --format <fmt>     json | csv | jsonl (default json)
      --csv, --jsonl     shortcuts for --format
  -s, --seed <seed>      deterministic output
  -p, --province <name>  Persian/English name or ISO code (e.g. اصفهان, Isfahan, IR-10)
      --gender <g>       male | female
      --operator <op>    MCI | Irancell | Rightel
      --case <case>      preserve | camel | snake | pascal | kebab
      --ref-date <iso>   fixed "now" for dates
      --unissued-ids     national IDs use the never-issued 000 prefix
  -o, --out <file>       write to a file instead of stdout
      --bom              prefix CSV with a UTF-8 BOM (for Excel)
      --compact          single-line JSON
  -h, --help | -v, --version

Examples
  npx mock-iran person -n 50 --csv
  npx mock-iran user -n 100 --seed 42 --province اصفهان --case snake
  npx mock-iran schema ./schema.json -n 100 --format csv -o users.csv
`;

interface Args { _: string[]; [k: string]: string | boolean | string[] }
function parse(argv: string[]): Args {
  const a: Args = { _: [] };
  const alias: Record<string, string> = { n: "count", f: "format", s: "seed", p: "province", o: "out", h: "help", v: "version" };
  const flags = new Set(["csv", "jsonl", "json", "bom", "compact", "help", "version", "unissued-ids"]);
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("-") && t !== "-") {
      let [k, v] = t.replace(/^-+/, "").split(/=(.*)/s);
      k = alias[k] ?? k;
      if (flags.has(k)) a[k] = true;
      else { if (v === undefined) v = argv[++i]; if (v === undefined) fail(`missing value for --${k}`); a[k] = v; }
    } else a._.push(t);
  }
  return a;
}
function fail(msg: string): never { process.stderr.write(`mock-iran: ${msg}\nRun mock-iran --help for usage.\n`); process.exit(1); }

function main(argv: string[]) {
  const a = parse(argv);
  if (a.version) return out(VERSION + "\n");
  const cmd = a._[0];
  if (a.help || !cmd) return out(HELP);
  const seed = a.seed as string | undefined;
  const f = new Iran({ seed: seed === undefined ? undefined : /^\d+$/.test(seed) ? Number(seed) : seed, referenceDate: a["ref-date"] as string | undefined });
  if (cmd === "paths") return out(Object.entries(listPaths(f)).map(([g, p]) => `${g}:\n  ${p.join("\n  ")}`).join("\n") + "\n");
  if (cmd === "banks") return out(f.banks().map((b) => `${b.id}\t${b.name}\t${b.nameEn}`).join("\n") + "\n");
  if (cmd === "provinces") return out(f.provinces().map((p) => `${p.iso}\t${p.name}\t${p.nameEn}\t${p.areaCode}`).join("\n") + "\n");

  const count = Number(a.count ?? 10);
  if (!Number.isInteger(count) || count < 0) fail("--count must be a non-negative integer");
  const fmt = (a.csv ? "csv" : a.jsonl ? "jsonl" : a.json ? "json" : (a.format as string) ?? "json") as Format;
  if (!["json", "csv", "jsonl"].includes(fmt)) fail(`unknown format "${fmt}"`);
  const ctx: ContextOptions = {
    province: a.province as string | undefined, gender: a.gender as ContextOptions["gender"], operator: a.operator as ContextOptions["operator"],
    unissuedNationalId: Boolean(a["unissued-ids"]) || undefined,
  };
  if (ctx.gender && ctx.gender !== "male" && ctx.gender !== "female") fail("--gender must be male or female");
  const keyCase = (a.case as KeyCase) ?? "preserve";

  let result: Record<string, unknown>[] | Record<string, Record<string, unknown>[]>;
  if (cmd === "schema") {
    const file = a._[1] ?? fail("schema needs a file: mock-iran schema ./schema.json");
    let json: Record<string, unknown>;
    try { json = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch (e) { fail(`cannot read ${file}: ${(e as Error).message}`); }
    if (json.entities && typeof json.entities === "object") {
      const spec = Object.fromEntries(Object.entries(json.entities as Record<string, Record<string, unknown>>).map(([name, e]) => [name, {
        schema: new Schema(f, fromJson(f, e.fields ?? e) as SchemaDef, { context: { ...ctx, ...(e.context as object) }, case: keyCase }),
        count: Number(e.count ?? count),
      }]));
      result = f.dataset(spec);
    } else {
      const fields = (json.fields ?? json) as unknown;
      const s = new Schema(f, fromJson(f, fields) as SchemaDef, { context: { ...(json.context as object), ...strip(ctx) }, case: keyCase });
      result = s.many(json.fields && json.count !== undefined && a.count === undefined ? Number(json.count) : count);
    }
  } else {
    const presets = f.presets as Record<string, Schema>;
    const raw: Record<string, () => object> = {
      person: () => f.person({ province: ctx.province, gender: ctx.gender, unissuedNationalId: ctx.unissuedNationalId }),
      contact: () => f.contact({ province: ctx.province, operator: ctx.operator }),
      bank: () => f.bank(),
      company: () => f.company({ province: ctx.province }),
    };
    if (presets[cmd]) result = presets[cmd].withCase(keyCase).many(count, strip(ctx));
    else if (raw[cmd]) result = new Schema(f, { _: () => raw[cmd]() }, { case: keyCase }).many(count).map((r) => r._ as Record<string, unknown>);
    else fail(`unknown type "${cmd}". Try: user, seller, address, product, order, person, contact, bank, company, schema`);
  }

  let text: string;
  if (Array.isArray(result)) text = format(result, fmt, { bom: Boolean(a.bom), pretty: !a.compact });
  else if (fmt === "json") text = JSON.stringify(result, null, a.compact ? 0 : 2) + "\n";
  else if (fmt === "jsonl") text = Object.entries(result).flatMap(([entity, rows]) => rows.map((r) => JSON.stringify({ entity, ...r }))).join("\n") + "\n";
  else {
    if (!a.out) fail("a multi-entity schema with --format csv needs --out <prefix>; one file per entity is written as <prefix>.<entity>.csv");
    for (const [entity, rows] of Object.entries(result)) writeFileSync(`${String(a.out).replace(/\.csv$/i, "")}.${entity}.csv`, format(rows, "csv", { bom: Boolean(a.bom) }));
    process.stderr.write(`wrote ${Object.keys(result).length} CSV files\n`);
    return;
  }
  if (a.out) { writeFileSync(String(a.out), text); process.stderr.write(`wrote ${a.out}\n`); }
  else out(text);
}

function strip<T extends object>(o: T): T { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T; }
function out(s: string) { process.stdout.write(s); }

try { main(process.argv.slice(2)); } catch (e) { fail((e as Error).message); }
