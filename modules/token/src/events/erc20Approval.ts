import { type Candidate, defineEvent, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "erc20Approval",
  description: "ERC-20 approvals: the allowance left after the run.",
  event:
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
  suggest: async (env, { emitter, logs }) => {
    const pairs = new Map(
      logs.map((l) => [
        `${l.owner}:${l.spender}`,
        [getAddress(l.owner), getAddress(l.spender)] as const,
      ]),
    );
    const out: Candidate[] = [];
    for (const [owner, spender] of pairs.values()) {
      const allowance = await env.read(
        emitter,
        "function allowance(address,address) view returns (uint256)",
        [owner, spender],
      );
      if (typeof allowance !== "bigint") continue;
      out.push({
        line: `assert @token:allowance!(${emitter} ${owner} ${spender}) == ${allowance}`,
        description:
          allowance === 0n
            ? `${truncateAddress(spender)} is left with no ${await env.tokenName(emitter)} allowance`
            : `${truncateAddress(spender)} is left with an allowance of ${await env.formatAmount(emitter, allowance)}`,
        kind: "amount",
      });
    }
    return out;
  },
});
