import {
  account,
  type Candidate,
  defineEvent,
  exactly,
  line,
  say,
  token,
} from "@evmcrispr/sdk";
import { maxUint256 } from "viem";

export default defineEvent({
  name: "erc20Approval",
  description: "ERC-20 approvals: the allowance left after the run.",
  event:
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
  suggest: async (env, { emitter, logs }) => {
    const erc20 = await token(env, emitter);
    const pairs = new Map(
      logs.map((l) => [
        `${l.owner}:${l.spender}`,
        [account(l.owner, "owner"), account(l.spender, "spender")] as const,
      ]),
    );
    const out: Candidate[] = [];
    for (const [owner, spender] of pairs.values()) {
      const allowance = await env.read(
        emitter,
        "function allowance(address,address) view returns (uint256)",
        [owner.address, spender.address],
      );
      if (typeof allowance !== "bigint") continue;
      const left = exactly(erc20, allowance);
      out.push({
        line: line`assert @token:allowance!(${erc20} ${owner} ${spender}) == ${left}`,
        sentence:
          allowance === 0n
            ? say`${spender} is left with no ${erc20} allowance from ${owner}`
            : allowance === maxUint256
              ? say`${spender} is left with an unlimited allowance of ${erc20} from ${owner}`
              : say`${spender} is left with an allowance of ${left} from ${owner}`,
        kind: "amount",
      });
    }
    return out;
  },
});
