import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "nonce",
  batchable: false,
  description:
    "Number of transactions sent from an address (its account nonce), read over plain RPC. For contracts the nonce counts the CREATEs they performed. Off-chain only: the EVM has no nonce opcode, so no on-chain form exists.",
  returnType: "number",
  args: [{ name: "address", type: "address", description: "Account address" }],
  async run(module, { address }) {
    const client = await module.getClient();
    const count = await client.getTransactionCount({ address });
    return count.toString();
  },
});
