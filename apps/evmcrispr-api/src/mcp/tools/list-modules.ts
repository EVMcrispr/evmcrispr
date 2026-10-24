import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getModuleOverview, listModules } from "evmcrispr/lib/docs-loader";

export function registerListModules(server: McpServer): void {
  server.registerTool(
    "evmcrispr_list_modules",
    {
      title: "List EVML Modules",
      description:
        "List all EVML modules with a one-line overview of each. Modules group related commands and helpers. Call evmcrispr_describe_module to see a module's commands and helpers, then run them by writing an EVML script and calling evmcrispr_simulate_evml.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const modules = await listModules();
      const lines = await Promise.all(
        modules.map(async (name) => {
          const overview = await getModuleOverview(name);
          return `- **${name}** — ${overview ?? "(no overview available)"}`;
        }),
      );
      const text = [
        "# EVML Modules",
        "",
        ...lines,
        "",
        "`std` is always available; other modules require `load <module>` at the top of the script. Use evmcrispr_describe_module to list a module's commands and helpers.",
      ].join("\n");
      return { content: [{ type: "text", text }] };
    },
  );
}
