import { computeNextContractAddress, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "nextContract",
  description: "Predict the next contract address deployed by a given account.",
  returnType: "address",
  args: [
    { name: "creator", type: "address" },
    { name: "offset", type: "number", optional: true },
  ],
  async run(module, { creator, offset = 0 }) {
    const client = await module.getClient();
    return computeNextContractAddress(creator, offset, (addr) =>
      client.getTransactionCount({ address: addr }),
    );
  },
});
