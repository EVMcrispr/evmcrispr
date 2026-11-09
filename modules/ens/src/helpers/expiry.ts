import { defineHelper, HelperFunctionError, Num } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { rawParam, staticCallParam, toWord } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, labelhash, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { baseRegistrarMap, requireAddress } from "../addresses";
import { v2Name } from "../ethRegistry";
import { onchainAddress, v2OrV1Read, v2ReadAbi } from "../onchain";
import { ensClient, eth2LDLabel, isEth2LD } from "../utils";

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
    const client = await ensClient(module);
    const v2 = await v2Name(client, mainnet.id, name);
    if (v2) return Num.fromBigInt(v2.expiry);
    const label = eth2LDLabel(name);
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
    // ENS v1 keeps expiries for .eth names only; a v1 subname has none.
    const v1 = isEth2LD(name)
      ? staticCallParam(
          registrar,
          encodeFunctionData({
            abi: parseAbi([
              "function nameExpires(uint256 id) view returns (uint256)",
            ]),
            functionName: "nameExpires",
            args: [BigInt(labelhash(eth2LDLabel(name)))],
          }),
        )
      : rawParam(toWord(0n));
    return v2OrV1Read(
      ctx,
      name,
      (label) =>
        encodeFunctionData({
          abi: v2ReadAbi,
          functionName: "getExpiry",
          args: [BigInt(labelhash(label))],
        }),
      v1,
      "Uint",
    );
  },
});
