import { defineHelper } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Gelato from "..";
import { requireAutomate } from "../utils/protocol";
import { dedicatedMsgSender } from "../utils/web3FunctionTask";

export default defineHelper<Gelato>({
  name: "dedicatedMsgSender",
  batchable: false,
  description:
    "The dedicated msg.sender Gelato assigns an account on this chain: the proxy every task of that account executes from (what @sender resolves to inside gelato:automate blocks and gelato:schedule scripts), and the operator a VRF consumer is deployed with. Deterministic, so it resolves before the proxy is deployed.",
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
    return dedicatedMsgSender(module, account as Address | undefined);
  },
});
