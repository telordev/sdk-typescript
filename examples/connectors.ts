/**
 * Connectors API example — register an MCP server, probe it, list, clean up.
 *
 * Usage:
 *   SIMSE_API_KEY=sk_... npx tsx examples/connectors.ts
 */
import { Simse } from "../src/index.js";

const client = new Simse(); // reads SIMSE_API_KEY from env

// Register a remote-MCP connector with a static bearer token.
const connector = await client.connectors.create({
  name: "My MCP Server",
  type: "mcp",
  url: "https://my-mcp-server.example.com/mcp",
  auth: { kind: "bearer", value: "bearer_token_here" },
  tool_denylist: ["admin_tool"],
});
console.log("Created connector:", connector.id);

// Probe the MCP server — live tools/list.
const testResult = await client.connectors.test(connector.id);
if (testResult.ok) {
  console.log(`Connected — ${testResult.tool_count} tool(s) available`);
} else {
  console.log("Connection failed:", testResult.error);
}

// List all connectors (secrets redacted in the response).
const list = await client.connectors.list();
console.log("Total connectors:", list.connectors.length);

// Partial update — rename the connector.
const updated = await client.connectors.update(connector.id, {
  name: "My MCP Server (renamed)",
});
console.log("Updated name:", updated.name);

// Clean up.
const deleted = await client.connectors.delete(connector.id);
console.log("Deleted:", deleted.deleted);
