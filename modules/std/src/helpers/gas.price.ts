import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "gas.price",
  batchable: false,
  description: "Current gas price in wei.",
  returnType: "number",
  args: [],
  async run(module) {
    const client = await module.getClient();
    const price = await client.getGasPrice();
    return price.toString();
  },
});
