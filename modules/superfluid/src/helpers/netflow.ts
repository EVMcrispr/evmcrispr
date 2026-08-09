import { defineHelper, Num } from "@evmcrispr/sdk";
import { arithCombine, callReadOperand } from "@evmcrispr/sdk/onchain";
import type { Abi, AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type Superfluid from "..";
import { cfaForwarderAbi, gdaForwarderAbi } from "../abis";
import { cfaForwarder, GDA_FORWARDER } from "../addresses";
import { compileSuperToken } from "../utils/onchain";
import { requireCore } from "../utils/protocol";
import { resolveSuperToken } from "../utils/supertoken";

export default defineHelper<Superfluid>({
  name: "netflow",
  batchable: false,
  description:
    "Net flow rate of an account (all incoming minus all outgoing streams, CFA plus GDA), in wei per second. Negative means the balance is draining. As @netflow! both agreement reads happen on-chain at assertion time and are summed there (the SuperToken still resolves at composition time).",
  returnType: "number",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol or address",
    },
    { name: "account", type: "address", description: "Account to inspect" },
  ],
  async run(module, { token, account }) {
    const chainId = await requireCore(module);
    const superToken = await resolveSuperToken(module, token);
    const client = await module.getClient();
    const [cfa, gda] = await Promise.all([
      client.readContract({
        address: cfaForwarder(chainId),
        abi: cfaForwarderAbi as Abi,
        functionName: "getAccountFlowrate",
        args: [superToken, account],
      }) as Promise<bigint>,
      client.readContract({
        address: GDA_FORWARDER,
        abi: gdaForwarderAbi as Abi,
        functionName: "getNetFlow",
        args: [superToken, account],
      }) as Promise<bigint>,
    ]);
    return Num.fromBigInt(cfa + gda);
  },
  compile: async (ctx, node) => {
    const chainId = await requireCore(ctx.module);
    const superToken = await compileSuperToken(ctx, node.args[0], "@netflow!");
    const account = node.args[1];
    // Two agreement reads, summed on-chain: the CFA and GDA forwarders
    // each know only their own half of the account net flow. Both are
    // int96 (an account draining more than it receives reads negative).
    const cfa = await callReadOperand(
      ctx,
      cfaForwarder(chainId),
      getAbiItem({
        abi: cfaForwarderAbi,
        name: "getAccountFlowrate",
      }) as AbiFunction,
      [{ value: superToken }, account],
      "Int",
    );
    const gda = await callReadOperand(
      ctx,
      GDA_FORWARDER,
      getAbiItem({ abi: gdaForwarderAbi, name: "getNetFlow" }) as AbiFunction,
      [{ value: superToken }, account],
      "Int",
    );
    return arithCombine(ctx, "Add", cfa, gda);
  },
});
