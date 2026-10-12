import { atLeast, defineEvent, line, say, token } from "@evmcrispr/sdk";
import { balanceFloors, netByAccount } from "./_shared";

export default defineEvent({
  name: "erc20Transfer",
  description:
    "ERC-20 transfers: a balance floor for the executor and for each account that received.",
  event:
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  suggest: async (env, { emitter, logs }) => {
    const erc20 = await token(env, emitter);
    return balanceFloors(
      env,
      netByAccount(logs as never),
      (account) =>
        env.read(
          emitter,
          "function balanceOf(address) view returns (uint256)",
          [account],
        ),
      (who, floor) => {
        // The floor at the precision it is said, which is what is asserted.
        const least = atLeast(erc20, floor);
        if (least.value === 0n) return null;
        return {
          line: line`assert @balance!(${erc20} ${who}) >= ${least}`,
          least: say`${least}`,
        };
      },
    );
  },
});
