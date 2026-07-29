import { defineHelper } from "@evmcrispr/sdk";
import type Contracts from "..";

export default defineHelper<Contracts>({
  name: "codeAt",
  batchable: false,
  description: "Return the deployed bytecode at an address.",
  returnType: "bytes",
  args: [
    {
      name: "address",
      type: "address",
      description: "Contract or account address",
    },
  ],
  async run(module, { address }) {
    const client = await module.getClient();
    const code = await client.getCode({ address });
    return code ?? "0x";
  },
});
