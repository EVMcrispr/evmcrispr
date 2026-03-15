import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./server.js";

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };
}

export async function startHttp(): Promise<void> {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST ?? "0.0.0.0";

  Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
      const url = new URL(req.url);

      // Health check
      if (url.pathname === "/health" && req.method === "GET") {
        return Response.json({ status: "ok" }, { headers: corsHeaders() });
      }

      // CORS preflight
      if (url.pathname === "/mcp" && req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      // MCP endpoint
      if (url.pathname === "/mcp") {
        const server = createMcpServer();
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(transport);

        const response = await transport.handleRequest(req);
        // Add CORS headers
        const headers = new Headers(response.headers);
        for (const [k, v] of Object.entries(corsHeaders())) {
          headers.set(k, v);
        }
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.error(`EVMcrispr MCP server listening on http://${host}:${port}`);
  console.error(`  MCP endpoint: POST http://${host}:${port}/mcp`);
  console.error(`  Health check: GET  http://${host}:${port}/health`);
}
