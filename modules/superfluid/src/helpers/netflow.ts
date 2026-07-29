import { defineHelper, Num } from "@evmcrispr/sdk";
import type { Abi } from "viem";
import type Superfluid from "..";
import { cfaForwarderAbi, gdaForwarderAbi } from "../abis";
import { cfaForwarder, GDA_FORWARDER } from "../addresses";
import { requireCore } from "../utils/protocol";
import { resolveSuperToken } from "../utils/supertoken";

export default defineHelper<Superfluid>({
  name: "netflow",
  batchable: false,
  description:
    "Net flow rate of an account (all incoming minus all outgoing streams, CFA plus GDA), in wei per second. Negative means the balance is draining.",
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
});
