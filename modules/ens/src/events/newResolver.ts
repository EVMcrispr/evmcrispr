import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "newResolver",
  description: "ENS registry: the resolver of a node after the run.",
  event: "event NewResolver(bytes32 indexed node, address resolver)",
  suggest: async (env, { emitter, logs }) => {
    const registry = await contract(env, emitter, "registry");
    const last = new Map<string, string>(logs.map((l) => [l.node, l.resolver]));
    const out = [];
    for (const [node, address] of last) {
      const resolver = account(address, "resolver");
      out.push(
        ...(await stateCandidate(
          env,
          {
            address: emitter,
            signature: "function resolver(bytes32) view returns (address)",
            args: [node],
            expect: resolver.address,
          },
          line`assert ${registry}::!{resolver(bytes32)(address) ${node}} == ${resolver}`,
          say`The resolver of the node set on ${registry} is ${resolver}`,
        )),
      );
    }
    return out;
  },
});
