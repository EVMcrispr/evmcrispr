import type { Address } from "@evmcrispr/sdk";
import {
  fetchContractSource,
  readEtherscanApiKey,
  renderContractSource,
} from "@evmcrispr/sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function registerGetContract(server: McpServer): void {
  server.registerTool(
    "evmcrispr_get_contract",
    {
      title: "Get Verified Contract Source",
      description:
        "Read the verified source code of a deployed contract from Etherscan. Without `file` it returns an overview: contract name, compiler settings, proxy information, the full ABI as human-readable signatures, and the list of source files. Pass `file` to read one source file. Use it to learn a contract's functions before writing exec calls against it in an EVML script.",
      inputSchema: {
        address: z.string().describe("Contract address (0x...)"),
        chainId: z
          .number()
          .optional()
          .describe("Target chain ID (default: 1 for Ethereum mainnet)"),
        file: z
          .string()
          .optional()
          .describe("Path of a source file from the overview to read"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ address, chainId, file }) => {
      const error = (text: string) => ({
        isError: true as const,
        content: [{ type: "text" as const, text }],
      });

      if (!ADDRESS_RE.test(address))
        return error(
          `"${address}" is not a valid address. Pass a 0x-prefixed 40-hex-char address.`,
        );
      if (!readEtherscanApiKey())
        return error(
          "No Etherscan API key is configured (VITE_ETHERSCAN_API_KEY), so contract source cannot be fetched.",
        );

      const chain = chainId ?? 1;
      const source = await fetchContractSource(chain, address as Address);
      if (!source)
        return error(
          `No verified source for ${address} on chain ${chain}. The contract may be unverified, the address may be an EOA, the chain may be unsupported by Etherscan, or the address may only be deployed on another chain — retry with the right chainId if so.`,
        );

      return {
        content: [
          { type: "text", text: renderContractSource(source, { file }) },
        ],
      };
    },
  );
}
