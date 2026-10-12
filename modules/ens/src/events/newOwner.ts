import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";
import { encodePacked, keccak256 } from "viem";
export default defineEvent({
  name: "newOwner",
  description: "ENS registry: the owner of a subnode after the run.",
  event:
    "event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner)",
  suggest: async (env, { emitter, logs }) => {
    const registry = await contract(env, emitter, "registry");
    const last = new Map<string, string>();
    for (const { node, label, owner } of logs) {
      last.set(
        keccak256(encodePacked(["bytes32", "bytes32"], [node, label])),
        owner,
      );
    }
    const out = [];
    for (const [subnode, address] of last) {
      const owner = account(address, "owner");
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function owner(bytes32) view returns (address)",
            args: [subnode],
            expect: owner.address,
          },
          line`assert ${registry}::!{owner(bytes32)(address) ${subnode}} == ${owner}`,
          say`The node created on ${registry} is owned by ${owner}`,
        )),
      );
    }
    return out;
  },
});
