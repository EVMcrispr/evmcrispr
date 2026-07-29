import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateEvml } from "evmcrispr/tools/validate-evml";
import { z } from "zod";

export function registerValidateEvml(server: McpServer): void {
  server.registerTool(
    "evmcrispr_validate_evml",
    {
      title: "Validate EVML Script",
      description:
        "Parse an EVML script without executing. Returns diagnostics (errors/warnings) and document symbols. No RPC connection needed.",
      inputSchema: {
        script: z.string().describe("The EVML script to validate"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ script }) => {
      const result = await validateEvml(script);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
