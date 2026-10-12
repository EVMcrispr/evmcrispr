import { defineEvent } from "@evmcrispr/sdk";
import { balanceFloors, netByAccount } from "./_shared";

export default defineEvent({
  name: "erc20Transfer",
  description:
    "ERC-20 transfers: a balance floor for the executor and for each account that received.",
  event:
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  suggest: async (env, { emitter, logs }) =>
    balanceFloors(
      env,
      netByAccount(logs as never),
      (account) =>
        env.read(
          emitter,
          "function balanceOf(address) view returns (uint256)",
          [account],
        ),
      (account) => `@balance!(${emitter} ${account})`,
      await env.tokenName(emitter),
    ),
});
