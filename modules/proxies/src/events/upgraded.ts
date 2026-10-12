import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "upgraded",
  description:
    "ERC-1967 and beacon upgrades: the implementation after the run, where the contract exposes it.",
  event: "event Upgraded(address indexed implementation)",
  suggest: async (env, { emitter, logs }) => {
    const implementation = account(
      logs.at(-1)!.implementation,
      "implementation",
    );
    const target = await contract(env, emitter, "proxy");
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function implementation() view returns (address)",
        expect: implementation.address,
      },
      line`assert @proxies:implementation!(${target}) == ${implementation}`,
      say`${target} reports the implementation ${implementation}`,
    );
  },
});
