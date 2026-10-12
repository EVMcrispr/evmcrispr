import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "approvalForAll",
  description: "Operator approvals over a whole collection.",
  event:
    "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
  suggest: async (env, { emitter, logs }) => {
    const collection = await contract(env, emitter, "token");
    const last = new Map(logs.map((l) => [`${l.owner}:${l.operator}`, l]));
    const out = [];
    for (const l of last.values()) {
      const owner = account(l.owner, "owner");
      const operator = account(l.operator, "operator");
      const approved = l.approved as boolean;
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature:
              "function isApprovedForAll(address,address) view returns (bool)",
            args: [owner.address, operator.address],
            expect: approved,
          },
          line`assert ${collection}::!{isApprovedForAll(address,address)(bool) ${owner} ${operator}} == ${approved}`,
          say`${operator} ${approved ? "may" : "may no longer"} move every token of ${owner} in ${collection}`,
        )),
      );
    }
    return out;
  },
});
