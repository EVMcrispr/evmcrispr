import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadFullDocs } from "evmcrispr/lib/docs-loader";
import { z } from "zod";

export function registerWriteEvmlPrompt(server: McpServer): void {
  server.registerPrompt(
    "write_evml",
    {
      title: "Write EVML Script",
      description: "Generate an EVML script for a given task",
      argsSchema: {
        task: z.string().describe("Description of what the script should do"),
        chain: z
          .string()
          .optional()
          .describe(
            "Target chain (e.g. 'ethereum', 'gnosis'). Default: ethereum",
          ),
        modules: z
          .string()
          .optional()
          .describe(
            "Comma-separated module names to use (e.g. 'aragonos,sim')",
          ),
      },
    },
    async ({ task, chain, modules }) => {
      const docs = await loadFullDocs();

      const moduleList = modules
        ? modules.split(",").map((m) => m.trim())
        : ["std"];

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `You are an expert at writing EVMcrispr (EVML) scripts. Write a script for the following task.

## Task
${task}

## Target Chain
${chain ?? "ethereum (chain ID 1)"}

## Modules to Use
${moduleList.join(", ")}

## EVMcrispr Reference Documentation
${docs}

## Guidelines
- Always use \`load <module>\` before using module-prefixed commands
- Use \`sim:fork\` to test scripts in simulation before execution
- Use \`sim:expect\` for assertions in simulation
- Use \`set $var\` to define reusable variables
- Prefer descriptive variable names with \`$\` prefix
- Add comments with \`#\` for complex logic
- When interacting with contracts, use the full function signature

Return only the EVML script, wrapped in a code block.`,
            },
          },
        ],
      };
    },
  );
}
