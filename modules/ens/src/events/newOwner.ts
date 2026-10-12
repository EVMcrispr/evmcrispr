import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { encodePacked, getAddress, keccak256 } from "viem";

export default defineEvent({
  name: "newOwner",
  description: "ENS registry: the owner of a subnode after the run.",
  event:
    "event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner)",
  suggest: async (env, { emitter, logs }) => {
    const last = new Map<string, string>();
    for (const { node, label, owner } of logs) {
      last.set(
        keccak256(encodePacked(["bytes32", "bytes32"], [node, label])),
        getAddress(owner),
      );
    }
    const out = [];
    for (const [subnode, owner] of last) {
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function owner(bytes32) view returns (address)",
            args: [subnode],
            expect: owner,
          },
          `assert ${emitter}::!{owner(bytes32)(address) ${subnode}} == ${owner}`,
          `The node created on ${truncateAddress(emitter)} is owned by ${truncateAddress(owner)}`,
        )),
      );
    }
    return out;
  },
});
