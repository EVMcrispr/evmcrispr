import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "beaconUpgraded",
  description: "ERC-1967 beacon changes, where the proxy exposes its beacon.",
  event: "event BeaconUpgraded(address indexed beacon)",
  suggest: async (env, { emitter, logs }) => {
    const beacon = getAddress(logs.at(-1)!.beacon);
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function beacon() view returns (address)",
        expect: beacon,
      },
      `assert @proxies:beacon!(${emitter}) == ${beacon}`,
      `${truncateAddress(emitter)} reports the beacon ${truncateAddress(beacon)}`,
    );
  },
});
