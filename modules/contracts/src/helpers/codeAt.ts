import { defineHelper } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  compileOperand,
  materializeWord,
  OP_SELECTORS,
  opReadParam,
} from "@evmcrispr/sdk/onchain";
import type Contracts from "..";

export default defineHelper<Contracts>({
  name: "codeAt",
  batchable: false,
  description: "Deployed bytecode at an address.",
  compileDescription:
    "Sees code a batch deployed in an earlier step, and an address that self-destructed or was redeployed, which a build-time read cannot.",
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
  compile: async (ctx, node): Promise<Operand> => {
    const address = await compileOperand(ctx, node.args[0]);
    // The address may itself be live — a factory's predicted address, or
    // a proxy's implementation — so it materializes as a word rather
    // than resolving here.
    return {
      kind: "call",
      param: opReadParam(ctx, OP_SELECTORS.code, [
        materializeWord(ctx, address),
      ]),
      cat: "Bytes",
    };
  },
});
