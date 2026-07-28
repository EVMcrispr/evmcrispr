import type { Address } from "@evmcrispr/sdk";
import {
  defineHelper,
  ErrorException,
  fetchAddressTransactions,
  readEtherscanApiKey,
  resolveChainId,
} from "@evmcrispr/sdk";
import type Explorer from "..";

export default defineHelper<Explorer>({
  name: "txs",
  batchable: false,
  experimental: true,
  description:
    "Most recent transaction hashes sent to or from an address, newest first. Inspect individual entries with @explorer:tx. Needs an explorer API (Etherscan key or a chain with a Blockscout instance) — plain RPC cannot list per-address history.",
  returnType: "array",
  args: [
    { name: "address", type: "address", description: "Address to list" },
    {
      name: "chain",
      type: "chain",
      optional: true,
      description: "Chain to look on (default: current chain)",
    },
    {
      name: "limit",
      type: "number",
      optional: true,
      description: "Maximum number of transactions (default 10, max 50)",
    },
  ],
  async run(module, { address, chain, limit }) {
    const chainId =
      chain !== undefined ? resolveChainId(chain) : await module.getChainId();
    const count = Math.min(Math.max(Number(limit ?? 10) || 10, 1), 50);

    const txs = await fetchAddressTransactions(
      chainId,
      address as Address,
      count,
    );
    if (txs === null) {
      const hasKey = !!readEtherscanApiKey();
      throw new ErrorException(
        hasKey
          ? `could not fetch the transaction history of ${address} on chain ${chainId} — the explorer request failed`
          : `no explorer available for chain ${chainId} — transaction history needs an Etherscan API key or a chain with a Blockscout instance`,
      );
    }
    return txs.map((tx) => tx.hash);
  },
});
