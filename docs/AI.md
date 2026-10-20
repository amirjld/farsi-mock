# Using farsi-mock from AI assistants and MCP servers

## 1. Ready-made MCP server

```json
{
  "mcpServers": {
    "farsi-mock": { "command": "npx", "args": ["-y", "farsi-mock", "mcp"] }
  }
}
```

Works with any MCP client that speaks stdio (Claude Desktop, Cursor, VS Code, ...). Tools:

| Tool | Does |
| --- | --- |
| `farsi_mock_generate` | presets and raw generators (`user`, `person`, `bank`, `company`, `plate`, ...), any format |
| `farsi_mock_schema` | records or datasets from a schema-file JSON |
| `farsi_mock_infer` | infer from Prisma / OpenAPI / JSON Schema / sample text, with confidence report; optional generation |
| `farsi_mock_validate` | national ID, card, Sheba, mobile, postal code, legal ID |
| `farsi_mock_paths` | list of generator paths |

Counts are capped at 1000 per call. National IDs keep the safe `000` prefix unless `realisticIds: true`.

## 2. Inside another MCP server (for example parsi-mcp)

`farsi-mock/ai` has no dependencies, so an existing server can expose the same tools next to its own.

With the low-level SDK `Server`:

```ts
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { tools as mockTools, callTool as callMockTool } from "farsi-mock/ai";

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...myTools, ...mockTools] }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name.startsWith("farsi_mock_")) return callMockTool(req.params.name, req.params.arguments ?? {});
  return handleMyTool(req);
});
```

With `McpServer.registerTool` (it wants zod shapes), wrap the generator you need:

```ts
import { z } from "zod";
import { callTool } from "farsi-mock/ai";

server.registerTool("generate_test_data", {
  description: "Synthetic Iranian test data (people, bank accounts, companies, ...)",
  inputSchema: { type: z.enum(["user", "person", "bank", "company", "address", "product", "order", "plate"]), count: z.number().int().min(1).max(1000).default(10), seed: z.number().optional() },
}, async (args) => callTool("farsi_mock_generate", args));
```

`callTool` never throws; errors come back as `{ isError: true, content: [...] }`, the shape MCP expects.

## 3. Agent skill and llms.txt

- `skills/farsi-mock/SKILL.md`: drop into a skills folder so agents know when and how to use the CLI.
- `llms.txt` at the repo root summarises the API for LLM tools.
