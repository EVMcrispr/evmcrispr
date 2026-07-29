import { defineHelper, Num } from "@evmcrispr/sdk";
import type { Abi } from "viem";
import type Superfluid from "..";
import { superTokenAbi } from "../abis";
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
});
