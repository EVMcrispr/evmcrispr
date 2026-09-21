import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { encodeFunctionData, erc20Abi } from "viem";
import type Swaps from "..";
import { executeAccount, ownedAccount } from "../twap/account";
import { readOrderState } from "../twap/cow";
import { parseReference } from "../twap/reference";
import { resolveTwap } from "../twap/registry";
import { COW_VAULT_RELAYER } from "../venues/lib/cowApi";

export default defineCommand<Swaps>({
  name: "twap-recover",
  description:
    "Return residual TWAP sell tokens after cancellation, expiry, or proven complete settlement, removing authorization and clearing the allowance. Reads the current balance; run after prior actions are mined.",
  args: [
    {
      name: "order",
      type: "string",
      description: "JSON order reference bound by swaps:twap",
    },
  ],
  async run(module, { order }, { interpreters }) {
    if (interpreters.batchContext?.hasActions)
      throw new ErrorException(
        "twap-recover reads the account balance and cannot observe earlier actions in this batch; recover in a separate transaction after cancellation",
      );
    const ref = parseReference(order);
    const provider = await resolveTwap(module, ref.provider);
    const { client, block, nonce } = await ownedAccount(module, ref);
    const { schedule, registered, start, end } = await readOrderState(
      client,
      ref,
      block.number,
    );
    if (registered && (start === 0n || block.timestamp < end)) {
      const status = await provider.status(client, ref, {
        block,
        external: false,
      });
      if (status.filled !== "complete")
        throw new ErrorException(
          "TWAP is still live and not proven fully filled; cancel it and wait for cancellation to be mined before recovery",
        );
    }
    const balance = await client.readContract({
      address: schedule.sellToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [ref.account],
      blockNumber: block.number,
    });
    const calls = [
      provider.cancel(ref.orderHash),
      {
        to: schedule.sellToken,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [COW_VAULT_RELAYER, 0n],
        }),
      },
      ...(balance > 0n
        ? [
            {
              to: schedule.sellToken,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "transfer",
                args: [ref.controller, balance],
              }),
            },
          ]
        : []),
    ];
    return [
      executeAccount(ref.chainId, ref.account, ref.controller, nonce, calls),
    ];
  },
});
