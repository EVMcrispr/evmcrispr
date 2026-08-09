import type { Address } from "@evmcrispr/sdk";
import { clientFor, defineHelper, resolveChainId } from "@evmcrispr/sdk";
import type Receipts from "..";

export default defineHelper<Receipts>({
  name: "tx.count",
  batchable: false,
  experimental: true,
  description:
    "Number of transactions sent from an address (its account nonce), read over plain RPC. For contracts the nonce counts the CREATEs they performed. Off-chain only: the EVM has no nonce opcode, so no on-chain form exists.",
  returnType: "number",
  args: [
    { name: "address", type: "address", description: "Address to read" },
    {
      name: "chain",
      type: "chain",
      optional: true,
      description: "Chain to look on (default: current chain)",
    },
  ],
  async run(module, { address, chain }) {
    const chainId =
      chain !== undefined ? resolveChainId(chain) : await module.getChainId();
    const client = await clientFor(module, chainId);
    const count = await client.getTransactionCount({
      address: address as Address,
    });
    return count.toString();
  },
});
