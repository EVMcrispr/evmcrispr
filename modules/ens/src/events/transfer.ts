import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "transfer",
  description: "ENS registry: the owner of a node after the run.",
  event: "event Transfer(bytes32 indexed node, address owner)",
  suggest: async (env, { emitter, logs }) => {
    const registry = await contract(env, emitter, "registry");
    const last = new Map<string, string>(logs.map((l) => [l.node, l.owner]));
    const out = [];
    for (const [node, address] of last) {
      const owner = account(address, "owner");
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function owner(bytes32) view returns (address)",
            args: [node],
            expect: owner.address,
          },
          line`assert ${registry}::!{owner(bytes32)(address) ${node}} == ${owner}`,
          say`The node transferred on ${registry} is owned by ${owner}`,
        )),
      );
    }
    return out;
  },
});
