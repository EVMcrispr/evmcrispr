import { defineCommand } from "@evmcrispr/sdk";
import { encodeFunctionData, erc20Abi } from "viem";
import type Swaps from "..";
import { executeAccount, ownedAccount } from "../twap/account";
import { decodeSchedule } from "../twap/cow";
import { resolveReference } from "../twap/reference";
import { resolveTwap } from "../twap/registry";
import { COW_VAULT_RELAYER } from "../venues/lib/cowApi";

export default defineCommand<Swaps>({
  smartSupport: {
    kind: "static",
    reason: "The concrete order identifies its hash and settlement contract.",
  },
  name: "twap-cancel",
  description:
    "Cancel a CoW TWAP and revoke its sell-token allowance. Cancellation takes effect when mined; use twap-recover afterwards to return unused tokens.",
  args: [
    {
      name: "order",
      type: "bytes32",
      description: "Order hash bound by swaps:twap",
    },
  ],
  async run(module, { order }) {
    const ref = await resolveReference(module, order);
    const provider = await resolveTwap(module, ref.provider);
    const { nonce } = await ownedAccount(module, ref);
    const schedule = decodeSchedule(ref.params);
    return [
      executeAccount(ref.chainId, ref.account, ref.controller, nonce, [
        provider.cancel(ref.orderHash),
        {
          to: schedule.sellToken,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [COW_VAULT_RELAYER, 0n],
          }),
        },
      ]),
    ];
  },
});
