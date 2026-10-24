import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createApi } from "./api/index.js";
import { createMcpServer } from "./mcp/server.js";

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
  };
}

export interface HttpOptions {
  apiHost?: string;
  mcpHost?: string;
  api: (req: Request, peer: string) => Promise<Response>;
  mcp?: (req: Request) => Promise<Response>;
}

/** Route by the actual HTTP authority, never Origin or forwarding headers. */
export function createHttpHandler(options: HttpOptions) {
  const apiHost = options.apiHost ?? "api.evmcrispr.com";
  const mcpHost = options.mcpHost ?? "mcp.evmcrispr.com";
  if (apiHost === mcpHost) throw new Error("API and MCP hostnames must differ");
  return async (req: Request, peer = "unknown"): Promise<Response> => {
    const url = new URL(req.url);
    const hostname = url.hostname.toLowerCase();
    const hostHeader = req.headers.get("host");
    if (hostHeader) {
      try {
        const authority = new URL(`http://${hostHeader}`);
        if (
          authority.hostname !== hostname ||
          authority.username ||
          authority.password ||
          authority.pathname !== "/" ||
          authority.search ||
          authority.hash
        )
          return new Response("Not Found", { status: 404 });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    }
    if (
      hostname === apiHost &&
      url.pathname !== "/mcp" &&
      !url.pathname.startsWith("/mcp/")
    )
      return options.api(req, peer);
    if (hostname !== mcpHost || url.pathname !== "/mcp")
      return new Response("Not Found", { status: 404 });
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (options.mcp) return options.mcp(req);
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
  };
}

export async function startHttp(): Promise<void> {
  const port = Number(process.env.PORT) || 3002;
  const host = process.env.HOST ?? "0.0.0.0";
  const api = createApi();
  const handler = createHttpHandler({
    api: api.fetch,
    apiHost: process.env.API_HOSTNAME,
    mcpHost: process.env.MCP_HOSTNAME,
  });
  const server = Bun.serve({
    port,
    hostname: host,
    development: false,
    maxRequestBodySize: 10 * 1024 * 1024,
    fetch(req, server) {
      return handler(req, server.requestIP(req)?.address ?? "unknown");
    },
  });
  const shutdown = async () => {
    await server.stop();
    api.close();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  console.error(
    `EVMcrispr API and MCP listening on http://${host}:${port} (Bun ${Bun.version})`,
  );
  console.error(
    `  MCP endpoint: https://${process.env.MCP_HOSTNAME ?? "mcp.evmcrispr.com"}/mcp`,
  );
  console.error(
    `  API: https://${process.env.API_HOSTNAME ?? "api.evmcrispr.com"}`,
  );
}
