import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "approvalForAll",
  description: "Operator approvals over a whole collection.",
  event:
    "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
  suggest: async (env, { emitter, logs }) => {
    const last = new Map<
      string,
      { owner: string; operator: string; approved: boolean }
    >();
    for (const l of logs) {
      last.set(`${l.owner}:${l.operator}`, {
        owner: getAddress(l.owner),
        operator: getAddress(l.operator),
        approved: l.approved,
      });
    }
    const out = [];
    for (const { owner, operator, approved } of last.values()) {
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature:
              "function isApprovedForAll(address,address) view returns (bool)",
            args: [owner, operator],
            expect: approved,
          },
          `assert ${emitter}::!{isApprovedForAll(address,address)(bool) ${owner} ${operator}} == ${approved}`,
          `${truncateAddress(operator)} ${approved ? "may" : "may no longer"} move every ${await env.tokenName(emitter)} of ${truncateAddress(owner)}`,
        )),
      );
    }
    return out;
  },
});
