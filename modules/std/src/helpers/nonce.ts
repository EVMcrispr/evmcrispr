import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "nonce",
  description: "Get the transaction count (nonce) of an address.",
  returnType: "number",
  args: [
    { name: "address", type: "address", description: "Account address" },
  ],
  async run(module, { address }) {
    const client = await module.getClient();
    const count = await client.getTransactionCount({ address });
    return count.toString();
  },
});
