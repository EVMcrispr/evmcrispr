import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  loadCommandDocs,
  loadHelperDocs,
  MODULES,
} from "evmcrispr/lib/docs-loader";
import { z } from "zod";

export function registerGetDocs(server: McpServer): void {
  server.registerTool(
    "evmcrispr_get_docs",
    {
      title: "Get Command/Helper Docs",
      description:
        "Get the full documentation of an EVML command or helper: syntax, arguments, options, and examples. Use evmcrispr_describe_module to discover available names. Run it by writing an EVML script and calling evmcrispr_simulate_evml.",
      inputSchema: {
        module: z
          .enum(MODULES as [string, ...string[]])
          .describe("Module the command/helper belongs to"),
        name: z
          .string()
          .describe(
            "Command or helper name, e.g. 'act', 'token-balance'. Module prefix and '@' are optional.",
          ),
        kind: z
          .enum(["command", "helper"])
          .optional()
          .describe("Restrict lookup to commands or helpers"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ module, name, kind }) => {
      const bare = name.replace(new RegExp(`^@?(${module}:)?`), "");

      let docs: string | null = null;
      if (kind !== "helper") docs = await loadCommandDocs(module, bare);
      if (!docs && kind !== "command")
        docs = await loadHelperDocs(module, bare);

      if (!docs) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `No ${kind ?? "command or helper"} named "${bare}" found in module "${module}". Call evmcrispr_describe_module with module "${module}" to list available commands and helpers.`,
            },
          ],
        };
      }
      return { content: [{ type: "text", text: docs }] };
    },
  );
}
