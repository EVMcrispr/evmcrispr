import { defineHelper, Num } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { Abi, AbiFunction } from "viem";
import { getAbiItem } from "viem";
import type Superfluid from "..";
import { superTokenAbi } from "../abis";
import { compileSuperToken } from "../utils/onchain";
import { requireCore } from "../utils/protocol";
import { resolveSuperToken } from "../utils/supertoken";

export default defineHelper<Superfluid>({
  name: "balance",
  batchable: false,
  description:
    "Real-time available SuperToken balance of an account: the streaming balance at this instant, minus buffer deposits. Negative when the account is critical.",
  returnType: "number",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol or address",
    },
    {
      name: "account",
      type: "address",
      optional: true,
      description: "Account to inspect (defaults to the connected account)",
    },
  ],
  async run(module, { token, account }) {
    await requireCore(module);
    const superToken = await resolveSuperToken(module, token);
    const owner = account ?? (await module.getConnectedAccount(true));
    const client = await module.getClient();
    const [available] = (await client.readContract({
      address: superToken,
      abi: superTokenAbi as Abi,
      functionName: "realtimeBalanceOfNow",
      args: [owner],
    })) as [bigint, bigint, bigint, bigint];
    return Num.fromBigInt(available);
  },
  compile: async (ctx, node) => {
    await requireCore(ctx.module);
    const superToken = await compileSuperToken(ctx, node.args[0], "@balance!");
    const owner = node.args[1] ?? {
      value: await ctx.module.getConnectedAccount(true),
    };
    // realtimeBalanceOfNow returns (int256 availableBalance, uint256
    // deposit, uint256 owedDeposit, uint256 timestamp); word 0 is the
    // available balance, already net of the buffer.
    return callReadOperand(
      ctx,
      superToken,
      getAbiItem({
        abi: superTokenAbi,
        name: "realtimeBalanceOfNow",
      }) as AbiFunction,
      [owner],
      "Int",
      0n,
    );
  },
});
