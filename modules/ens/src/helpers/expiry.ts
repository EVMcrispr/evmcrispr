import { defineHelper, HelperFunctionError, Num } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { staticCallParam } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, labelhash, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { baseRegistrarMap, requireAddress } from "../addresses";
import { onchainAddress } from "../onchain";
import { eth2LDLabel, mainnetClient } from "../utils";

export default defineHelper<Ens>({
  name: "expiry",
  batchable: false,
  description: "Registration expiry timestamp of a .eth name.",
  compileDescription:
    "Mainnet only, since an assertion reads the chain it runs on, and an unregistered name reads as 0 rather than erroring.",
  returnType: "number",
  args: [
    {
      name: "name",
      type: "string",
      description: ".eth second-level name (e.g. vitalik.eth)",
    },
  ],
  async run(module, { name }, { node }) {
    const label = eth2LDLabel(name);
    const client = mainnetClient(module);
    const expiry = await client.readContract({
      address: requireAddress(baseRegistrarMap, mainnet.id, "BaseRegistrar"),
      abi: parseAbi([
        "function nameExpires(uint256 id) view returns (uint256)",
      ]),
      functionName: "nameExpires",
      args: [BigInt(labelhash(label))],
    });
    if (expiry === 0n) {
      throw new HelperFunctionError(node, `${name} is not registered`);
    }
    return Num.fromBigInt(expiry);
  },
  compile: async (ctx, node): Promise<Operand> => {
    const name = String(await ctx.interpreters.interpretNode(node.args[0]));
    const registrar = await onchainAddress(
      ctx,
      baseRegistrarMap,
      "BaseRegistrar",
    );
    return {
      kind: "call",
      param: staticCallParam(
        registrar,
        encodeFunctionData({
          abi: parseAbi([
            "function nameExpires(uint256 id) view returns (uint256)",
          ]),
          functionName: "nameExpires",
          args: [BigInt(labelhash(eth2LDLabel(name)))],
        }),
      ),
      cat: "Uint",
    };
  },
});
