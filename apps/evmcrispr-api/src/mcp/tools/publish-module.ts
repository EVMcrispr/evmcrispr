import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { publishModule } from "evmcrispr/tools/publish-module";
import { z } from "zod";

export function registerPublishModule(server: McpServer): void {
  server.registerTool(
    "evmcrispr_publish_module",
    {
      title: "Publish EVML Module",
      description:
        'Validate an EVML module file (exactly one `module <name> ( ...defs )` command) and pin it to IPFS as PLAIN text, returning the `load <name> --from ipfs://<cid>` line. Note: this is different from evmcrispr_create_link, whose pins are encrypted share links and can only be loaded with --from by appending the link\'s key and quoting: "ipfs://<cid>#<key>".',
      inputSchema: {
        source: z
          .string()
          .describe(
            "The module file source: a single `module <name> ( ... )` command whose block contains only def commands",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ source }) => {
      const result = await publishModule({ source });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
