import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { simulateEvml } from "evmcrispr/tools/simulate-evml";
import { z } from "zod";

export function registerSimulateEvml(server: McpServer): void {
  server.registerTool(
    "evmcrispr_simulate_evml",
    {
      title: "Simulate EVML Script",
      description:
        "Execute an EVML script in a simulated fork (EthereumJS backend). This is how you run any EVML command or helper discovered via evmcrispr_list_modules / evmcrispr_describe_module: write a script using them (with `load <module>` for non-std modules) and simulate it. Returns execution logs and success status. If the script doesn't contain `load sim` and `sim:fork`, it will be auto-wrapped.",
      inputSchema: {
        script: z.string().describe("The EVML script to simulate"),
        chainId: z
          .number()
          .optional()
          .describe("Target chain ID (default: 1 for Ethereum mainnet)"),
        blockNumber: z
          .number()
          .optional()
          .describe("Block number to fork from (default: latest)"),
        from: z
          .string()
          .optional()
          .describe("Address to impersonate as sender (0x...)"),
        rpcUrl: z
          .string()
          .optional()
          .describe("RPC URL override (default: uses DRPC_API_KEY)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const result = await simulateEvml(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
