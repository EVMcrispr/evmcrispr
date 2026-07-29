import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadModuleDocs, MODULES } from "evmcrispr/lib/docs-loader";
import { z } from "zod";

export function registerDescribeModule(server: McpServer): void {
  server.registerTool(
    "evmcrispr_describe_module",
    {
      title: "Describe EVML Module",
      description:
        "Get an EVML module's overview and the list of its commands and helpers with one-line descriptions. Call evmcrispr_get_docs for the full docs of a specific command or helper. Run commands/helpers by writing an EVML script and calling evmcrispr_simulate_evml.",
      inputSchema: {
        module: z
          .enum(MODULES as [string, ...string[]])
          .describe("Module name (see evmcrispr_list_modules)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ module }) => {
      const docs = await loadModuleDocs(module);
      if (!docs) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `No docs found for module "${module}". Valid modules: ${MODULES.join(", ")}.`,
            },
          ],
        };
      }
      return { content: [{ type: "text", text: docs }] };
    },
  );
}
