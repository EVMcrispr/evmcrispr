import {
  fetchContractSource,
  renderContractSource,
  resolveChainId,
} from "@evmcrispr/sdk";
import { type ToolSet, tool } from "ai";
import type { Address } from "viem";
import { z } from "zod";
import { untrusted } from "./untrusted";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Contract-reading tools: verified source and ABI from a block explorer
 * (Etherscan with a key or a proxy, else the EVMcrispr API's cache of it,
 * else Blockscout), so the model can learn a contract's actual interface
 * and behavior instead of guessing function signatures.
 */
export function createContractTools(
  /** Chain id the host is currently working against, used when a call
   *  doesn't specify one explicitly. */
  getDefaultChainId: () => number | undefined,
): ToolSet {
  const getContract = tool({
    description:
      "Read the verified source code of a deployed contract from a block explorer (Etherscan or Blockscout). Without `file` it returns an overview: contract name, compiler settings, proxy information, the full ABI as human-readable signatures, and the list of source files. Pass `file` to read one source file. Use it to learn a contract's functions before writing exec calls against it, or to explain what a contract does.",
    inputSchema: z.object({
      address: z.string().describe("Contract address (0x...)"),
      chain: z
        .union([z.number(), z.string()])
        .optional()
        .describe(
          "Chain id or viem chain name (e.g. 100 or gnosis). Defaults to the chain the host is connected to.",
        ),
      file: z
        .string()
        .optional()
        .describe("Path of a source file from the overview to read"),
    }),
    execute: async ({ address, chain, file }) => {
      if (!ADDRESS_RE.test(address))
        return `ERROR: "${address}" is not a valid address. Pass a 0x-prefixed 40-hex-char address; resolve ENS names first (e.g. simulate a \`print @ens(...)\` one-liner).`;
      let chainId: number | undefined;
      try {
        chainId = chain != null ? resolveChainId(chain) : getDefaultChainId();
      } catch (err) {
        return `ERROR: ${err instanceof Error ? err.message : err}`;
      }
      if (chainId == null)
        return "ERROR: no chain is connected and none was given. Pass `chain`.";

      const source = await fetchContractSource(chainId, address as Address);
      if (!source)
        return `ERROR: no verified source for ${address} on chain ${chainId}. The contract may be unverified, the address may be an EOA, no explorer this host can reach may cover the chain or answer right now, or the address may only be deployed on another chain — retry with the right \`chain\` if so, or fall back to search_web/fetch_page for documentation.`;

      return untrusted(
        "a contract's verified source",
        renderContractSource(source, { file }),
      );
    },
  });

  return { get_contract: getContract };
}
