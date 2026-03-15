import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createLink } from "evmcrispr/tools/create-link";
import { z } from "zod";

export function registerCreateLink(server: McpServer): void {
  server.registerTool(
    "evmcrispr_create_link",
    {
      title: "Create Shareable EVML Link",
      description:
        "Pin an EVML script to IPFS and return a shareable link. Requires VITE_PINATA_JWT env var.",
      inputSchema: {
        script: z.string().describe("The EVML script content"),
        title: z.string().describe("Title for the shared script"),
        baseUrl: z
          .string()
          .optional()
          .describe(
            "Base URL for the generated link (default: https://localhost:3000)",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await createLink(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
