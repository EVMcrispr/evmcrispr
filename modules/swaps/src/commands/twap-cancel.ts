import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { encodeFunctionData, erc20Abi, isAddressEqual } from "viem";
import type Swaps from "..";
import { executeAccount, ownedAccount, selfOwned } from "../twap/account";
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
    "Cancel a CoW TWAP and revoke its sell-token allowance. Cancellation takes effect when mined; use twap-recover afterwards to return unused tokens. An order a Safe owns itself is only removed: its tokens never left the Safe, and the allowance its other CoW orders share stays.",
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
    if (selfOwned(ref)) {
      if ((await module.getChainId()) !== ref.chainId)
        throw new ErrorException(
          `TWAP reference belongs to chain ${ref.chainId}`,
        );
      if (!isAddressEqual(await module.getSender(), ref.controller))
        throw new ErrorException(
          "TWAP must be managed by its original controller (@sender)",
        );
      return [provider.cancel(ref.orderHash)];
    }
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
