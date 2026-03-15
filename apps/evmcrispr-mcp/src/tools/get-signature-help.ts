import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSignatureHelp } from "evmcrispr/tools/get-signature-help";
import { z } from "zod";

export function registerGetSignatureHelp(server: McpServer): void {
  server.registerTool(
    "evmcrispr_get_signature_help",
    {
      title: "Get EVML Signature Help",
      description:
        "Get parameter signature help for a command or helper at a specific position in an EVML script.",
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
      const help = await getSignatureHelp(script, line, col);
      return {
        content: [
          {
            type: "text",
            text: help
              ? JSON.stringify(help, null, 2)
              : "No signature help available at this position.",
          },
        ],
      };
    },
  );
}
