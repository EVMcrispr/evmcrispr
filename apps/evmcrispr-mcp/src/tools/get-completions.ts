import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCompletions } from "evmcrispr/tools/get-completions";
import { z } from "zod";

export function registerGetCompletions(server: McpServer): void {
  server.registerTool(
    "evmcrispr_get_completions",
    {
      title: "Get EVML Completions",
      description:
        "Get autocompletion suggestions at a cursor position in an EVML script.",
      inputSchema: {
        script: z.string().describe("The EVML script"),
        line: z.number().describe("Cursor line (1-indexed)"),
        col: z.number().describe("Cursor column (0-indexed)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ script, line, col }) => {
      const items = await getCompletions(script, line, col);
      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      };
    },
  );
}
