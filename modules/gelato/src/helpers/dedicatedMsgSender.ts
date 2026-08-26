import { defineHelper } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Gelato from "..";
import { opsProxyFactoryAbi } from "../abis";
import { OPS_PROXY_FACTORY_ADDRESS } from "../addresses";
import { requireAutomate } from "../utils/protocol";

export default defineHelper<Gelato>({
  name: "dedicatedMsgSender",
  batchable: false,
  description:
    "The dedicated msg.sender Gelato assigns an account on this chain: the proxy that Web3 Function and --dedicated tasks call targets from, and the operator a VRF consumer is deployed with. Deterministic, so it resolves before the proxy is deployed.",
  returnType: "address",
  args: [
    {
      name: "account",
      type: "address",
      description: "Task creator (defaults to the connected account)",
      optional: true,
    },
  ],
  async run(module, { account }) {
    await requireAutomate(module);
    const owner =
      (account as Address | undefined) ?? (await module.getConnectedAccount());
    const client = await module.getClient();
    return client.readContract({
      address: OPS_PROXY_FACTORY_ADDRESS,
      abi: opsProxyFactoryAbi,
      functionName: "determineProxyAddress",
      args: [owner],
    });
  },
});
