import {
  fetchContractSource,
  readEtherscanApiKey,
  renderContractSource,
  resolveChainId,
} from "@evmcrispr/sdk";
import { getChainId } from "@wagmi/core";
import { type ToolSet, tool } from "ai";
import type { Address } from "viem";
import { z } from "zod";

import { config as wagmiConfig } from "../config/wagmi";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Contract-reading tools: verified source and ABI from Etherscan, so the
 * model can learn a contract's actual interface and behavior instead of
 * guessing function signatures.
 */
export function createContractTools(): ToolSet {
  const getContract = tool({
    description:
      "Read the verified source code of a deployed contract from Etherscan. Without `file` it returns an overview: contract name, compiler settings, proxy information, the full ABI as human-readable signatures, and the list of source files. Pass `file` to read one source file. Use it to learn a contract's functions before writing exec calls against it, or to explain what a contract does.",
    inputSchema: z.object({
      address: z.string().describe("Contract address (0x...)"),
      chain: z
        .union([z.number(), z.string()])
        .optional()
        .describe(
          "Chain id or viem chain name (e.g. 100 or gnosis). Defaults to the chain the terminal is connected to.",
        ),
      file: z
        .string()
        .optional()
        .describe("Path of a source file from the overview to read"),
    }),
    execute: async ({ address, chain, file }) => {
      if (!ADDRESS_RE.test(address))
        return `ERROR: "${address}" is not a valid address. Pass a 0x-prefixed 40-hex-char address; resolve ENS names first (e.g. simulate a \`print @ens(...)\` one-liner).`;
      if (!readEtherscanApiKey())
        return "ERROR: no Etherscan API key is configured in this build, so contract source cannot be fetched. Fall back to search_web/fetch_page for documentation.";

      let chainId: number;
      try {
        chainId =
          chain != null ? resolveChainId(chain) : getChainId(wagmiConfig);
      } catch (err) {
        return `ERROR: ${err instanceof Error ? err.message : err}`;
      }

      const source = await fetchContractSource(chainId, address as Address);
      if (!source)
        return `ERROR: no verified source for ${address} on chain ${chainId}. The contract may be unverified, the address may be an EOA, the chain may be unsupported by Etherscan, or the address may only be deployed on another chain — retry with the right \`chain\` if so.`;

      return renderContractSource(source, { file });
    },
  });

  return { get_contract: getContract };
}
