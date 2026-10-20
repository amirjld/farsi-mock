import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";
import { tools, callTool, handleMcpMessage, serveMcpStdio } from "../src/ai.js";
import { validateNationalId } from "./parsi/validators.js";

describe("AI tools", () => {
  it("definitions are valid JSON Schema objects with unique names", () => {
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const t of tools) { expect(t.inputSchema.type).toBe("object"); expect(t.description.length).toBeGreaterThan(20); }
  });
  it("generate", async () => {
    const r = await callTool("farsi_mock_generate", { type: "person", count: 5, seed: 1 });
    const rows = JSON.parse(r.content[0].text);
    expect(rows).toHaveLength(5);
    for (const p of rows) { expect(validateNationalId(p.nationalId)).toBe(true); expect(p.nationalId.startsWith("000")).toBe(true); }
    const again = await callTool("farsi_mock_generate", { type: "person", count: 5, seed: 1 });
    expect(again.content[0].text).toBe(r.content[0].text);
    const sql = await callTool("farsi_mock_generate", { type: "user", count: 2, format: "sql", dialect: "mysql" });
    expect(sql.content[0].text).toContain("INSERT INTO `user`");
    expect(JSON.parse((await callTool("farsi_mock_generate", { type: "plate", count: 5000 })).content[0].text)).toHaveLength(1000);
    expect((await callTool("farsi_mock_generate", { type: "dragon" })).isError).toBe(true);
  });
  it("schema and infer", async () => {
    const s = await callTool("farsi_mock_schema", { schema: { id: "id.uuid", mobile: "contact.mobile" }, count: 3 });
    expect(JSON.parse(s.content[0].text)).toHaveLength(3);
    const ds = await callTool("farsi_mock_schema", { schema: { entities: { u: { count: 2, fields: { id: "id.uuid" } }, o: { count: 3, fields: { u: "ref:u.id" } } } } });
    expect(JSON.parse(ds.content[0].text).o).toHaveLength(3);
    expect((await callTool("farsi_mock_schema", { schema: { x: "nope.path" } })).isError).toBe(true);
    const prisma = readFileSync(new URL("./fixtures/shop.prisma", import.meta.url), "utf8");
    const inf = await callTool("farsi_mock_infer", { input: prisma });
    const body = JSON.parse(inf.content[0].text);
    expect(body.schema.entities.Order.fields.userId).toBe("ref:User.id");
    expect(body.averageConfidence).toBeGreaterThan(0.8);
    const gen = await callTool("farsi_mock_infer", { input: JSON.stringify([{ tel: "09121234567" }]), generate: true, count: 2 });
    expect(gen.content[0].text).toMatch(/"tel": "09\d{9}"/);
    expect((await callTool("farsi_mock_infer", { input: " " })).isError).toBe(true);
  });
  it("validate and paths", async () => {
    expect(JSON.parse((await callTool("farsi_mock_validate", { kind: "nationalId", value: "۰۰۱۰۳۵۰۸۲۹" })).content[0].text).valid).toBe(true);
    expect(JSON.parse((await callTool("farsi_mock_validate", { kind: "sheba", value: "IR000000000000000000000000" })).content[0].text).valid).toBe(false);
    expect((await callTool("farsi_mock_validate", { kind: "bankOfCard", value: "x" })).isError).toBe(true);
    expect((await callTool("farsi_mock_paths")).content[0].text).toContain("person.nationalId");
    expect((await callTool("nope")).isError).toBe(true);
  });
});

describe("MCP protocol", () => {
  it("initialize, list, call, errors", async () => {
    const init = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
    expect(init).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "farsi-mock" }, capabilities: { tools: {} } } });
    expect(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeUndefined();
    const list = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect((list!.result as { tools: unknown[] }).tools).toHaveLength(tools.length);
    const call = await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "farsi_mock_paths", arguments: {} } });
    expect(JSON.stringify(call)).toContain("person.nationalId");
    expect(await handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "x" } })).toMatchObject({ error: { code: -32602 } });
    expect(await handleMcpMessage({ jsonrpc: "2.0", id: 5, method: "resources/list" })).toMatchObject({ error: { code: -32601 } });
  });
  it("stdio transport", async () => {
    const input = new PassThrough(), output = new PassThrough();
    serveMcpStdio(input, output);
    const lines: string[] = [];
    output.on("data", (d) => lines.push(...String(d).trim().split("\n")));
    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\nnot json\n');
    input.write('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"farsi_mock_generate","arguments":{"type":"bank","count":1}}}\n');
    await new Promise((r) => setTimeout(r, 50));
    const msgs = lines.map((l) => JSON.parse(l));
    expect(msgs.find((m) => m.id === 1)).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect(msgs.find((m) => m.error?.code === -32700)).toBeDefined();
    expect(msgs.find((m) => m.id === 2).result.content[0].text).toContain("sheba");
  });
});
