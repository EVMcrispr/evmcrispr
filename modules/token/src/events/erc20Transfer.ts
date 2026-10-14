import {
  atLeast,
  balanceChecks,
  defineEvent,
  exactly,
  line,
  say,
  token,
} from "@evmcrispr/sdk";
import { netByAccount } from "./_shared";

export default defineEvent({
  name: "erc20Transfer",
  description:
    "ERC-20 transfers, added up per account: a balance floor for the executor and for each account that received, and none left for an account that sent everything.",
  event:
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  suggest: async (env, { emitter, logs }) => {
    const erc20 = await token(env, emitter);
    return balanceChecks(
      env,
      netByAccount(logs as never),
      (account) =>
        env.read(
          emitter,
          "function balanceOf(address) view returns (uint256)",
          [account],
        ),
      (who, op, value) => {
        if (op === "==" && value === 0n)
          return {
            line: line`assert @balance!(${erc20} ${who}) == 0`,
            amount: say`${exactly(erc20, 0n)}`,
          };
        // A floor at the precision it is said, which is what is asserted.
        const amount =
          op === "==" ? exactly(erc20, value) : atLeast(erc20, value);
        if (amount.value === 0n) return null;
        return {
          line: line`assert @balance!(${erc20} ${who}) ${op} ${amount}`,
          amount: say`${amount}`,
        };
      },
    );
  },
});
