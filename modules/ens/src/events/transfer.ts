import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "transfer",
  description: "ENS registry: the owner of a node after the run.",
  event: "event Transfer(bytes32 indexed node, address owner)",
  suggest: async (env, { emitter, logs }) => {
    const last = new Map<string, string>(
      logs.map((l) => [l.node, getAddress(l.owner)]),
    );
    const out = [];
    for (const [node, owner] of last) {
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function owner(bytes32) view returns (address)",
            args: [node],
            expect: owner,
          },
          `assert ${emitter}::!{owner(bytes32)(address) ${node}} == ${owner}`,
          `The node transferred on ${truncateAddress(emitter)} is owned by ${truncateAddress(owner)}`,
        )),
      );
    }
    return out;
  },
});
