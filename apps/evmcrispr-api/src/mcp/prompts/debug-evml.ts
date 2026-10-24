import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadFullDocs } from "evmcrispr/lib/docs-loader";
import { z } from "zod";

export function registerDebugEvmlPrompt(server: McpServer): void {
  server.registerPrompt(
    "debug_evml",
    {
      title: "Debug EVML Script",
      description: "Debug a failing EVML script",
      argsSchema: {
        script: z.string().describe("The failing EVML script"),
        error: z.string().describe("The error message or description"),
        logs: z.string().optional().describe("Execution logs, if available"),
      },
    },
    async ({ script, error, logs }) => {
      const docs = await loadFullDocs();

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `You are an expert at debugging EVMcrispr (EVML) scripts. Analyze the following failing script and provide a fix.

## Failing Script
\`\`\`
${script}
\`\`\`

## Error
${error}

${logs ? `## Execution Logs\n${logs}` : ""}

## EVMcrispr Reference Documentation
${docs}

## Instructions
1. Identify the root cause of the error
2. Explain why the script fails
3. Provide a corrected version of the script
4. If the error is related to on-chain state (e.g. insufficient balance, wrong address), explain what conditions need to be met

Return your analysis and the corrected script.`,
            },
          },
        ],
      };
    },
  );
}
