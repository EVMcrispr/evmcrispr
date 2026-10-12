import {
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "callScheduled",
  description: "TimelockController: a scheduled operation is pending.",
  event:
    "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
  suggest: async (env, { emitter, logs }) => {
    const target = await contract(env, emitter, "contract");
    const out = [];
    for (const id of new Set(logs.map((l) => l.id as string))) {
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature:
              "function isOperationPending(bytes32) view returns (bool)",
            args: [id],
            expect: true,
          },
          line`assert ${target}::!{isOperationPending(bytes32)(bool) ${id}} == true`,
          say`The operation scheduled on ${target} is pending`,
        )),
      );
    }
    return out;
  },
});
