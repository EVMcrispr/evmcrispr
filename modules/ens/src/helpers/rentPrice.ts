import { defineHelper, Num } from "@evmcrispr/sdk";
import {
  encodePick,
  staticCallParam,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { ethRegistrarControllerMap, requireAddress } from "../addresses";
import { onchainAddress } from "../onchain";
import { eth2LDLabel, mainnetClient } from "../utils";

export const rentPriceAbi = parseAbi([
  "struct Price { uint256 base; uint256 premium; }",
  "function rentPrice(string label, uint256 duration) view returns (Price price)",
]);

export default defineHelper<Ens>({
  name: "rentPrice",
  batchable: false,
  description:
    "Total price in wei to register or renew a .eth name for a duration.",
  compileDescription:
    "Mainnet only: an assertion reads the chain it runs on, and ENS cannot be reached from another chain.",
  returnType: "number",
  args: [
    {
      name: "name",
      type: "string",
      description: ".eth name or label (e.g. vitalik.eth or vitalik)",
    },
    {
      name: "duration",
      type: "number",
      description: "Duration, in time units (e.g. 1y)",
    },
  ],
  async run(module, { name, duration }) {
    const label = name.includes(".") ? eth2LDLabel(name) : name;
    const client = mainnetClient(module);
    const price = await client.readContract({
      address: requireAddress(
        ethRegistrarControllerMap,
        mainnet.id,
        "ETHRegistrarController",
      ),
      abi: rentPriceAbi,
      functionName: "rentPrice",
      args: [label, BigInt(duration)],
    });
    return Num.fromBigInt(price.base + price.premium);
  },
  // The Price struct is two inline words (base, premium); each is one
  // core pick over the same controller read, summed with one add. The
  // read is duplicated by the two picks — an operand is a tree — which
  // costs one extra cheap view call and beats synthesizing an envelope
  // for a word-sum recipe.
  compile: async (ctx, node) => {
    const name = String(await ctx.interpreters.interpretNode(node.args[0]));
    const label = name.includes(".") ? eth2LDLabel(name) : name;
    const duration = BigInt(
      String(await ctx.interpreters.interpretNode(node.args[1])),
    );
    const controller = await onchainAddress(
      ctx,
      ethRegistrarControllerMap,
      "ETHRegistrarController",
    );
    const call = staticCallParam(
      controller,
      encodeFunctionData({
        abi: rentPriceAbi,
        functionName: "rentPrice",
        args: [label, duration],
      }),
    );
    const base = staticCallParam(ctx.core, encodePick(call, 0n));
    const premium = staticCallParam(ctx.core, encodePick(call, 1n));
    return {
      kind: "call",
      param: wordOpParam(ctx, "add", false, base, premium),
      cat: "Uint",
    };
  },
});
