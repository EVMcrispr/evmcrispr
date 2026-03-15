import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getHoverInfo } from "evmcrispr/tools/get-hover-info";
import { z } from "zod";

export function registerGetHoverInfo(server: McpServer): void {
  server.registerTool(
    "evmcrispr_get_hover_info",
    {
      title: "Get EVML Hover Info",
      description:
        "Get documentation for a token at a specific position in an EVML script.",
      inputSchema: {
        script: z.string().describe("The EVML script"),
        line: z.number().describe("Token line (1-indexed)"),
        col: z.number().describe("Token column (0-indexed)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ script, line, col }) => {
      const info = await getHoverInfo(script, line, col);
      return {
        content: [
          {
            type: "text",
            text: info
              ? JSON.stringify(info, null, 2)
              : "No hover info available at this position.",
          },
        ],
      };
    },
  );
}
