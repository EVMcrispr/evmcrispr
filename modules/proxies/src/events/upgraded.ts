import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "upgraded",
  description:
    "ERC-1967 and beacon upgrades: the implementation after the run, where the contract exposes it.",
  event: "event Upgraded(address indexed implementation)",
  suggest: async (env, { emitter, logs }) => {
    const implementation = getAddress(logs.at(-1)!.implementation);
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function implementation() view returns (address)",
        expect: implementation,
      },
      `assert @proxies:implementation!(${emitter}) == ${implementation}`,
      `${truncateAddress(emitter)} reports the implementation ${truncateAddress(implementation)}`,
    );
  },
});
