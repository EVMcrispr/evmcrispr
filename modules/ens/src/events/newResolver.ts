import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "newResolver",
  description: "ENS registry: the resolver of a node after the run.",
  event: "event NewResolver(bytes32 indexed node, address resolver)",
  suggest: async (env, { emitter, logs }) => {
    const last = new Map<string, string>(
      logs.map((l) => [l.node, getAddress(l.resolver)]),
    );
    const out = [];
    for (const [node, resolver] of last) {
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function resolver(bytes32) view returns (address)",
            args: [node],
            expect: resolver,
          },
          `assert ${emitter}::!{resolver(bytes32)(address) ${node}} == ${resolver}`,
          `The resolver of the node set on ${truncateAddress(emitter)} is ${truncateAddress(resolver)}`,
        )),
      );
    }
    return out;
  },
});
