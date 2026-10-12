import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "beaconUpgraded",
  description: "ERC-1967 beacon changes, where the proxy exposes its beacon.",
  event: "event BeaconUpgraded(address indexed beacon)",
  suggest: async (env, { emitter, logs }) => {
    const beacon = account(logs.at(-1)!.beacon, "beacon");
    const target = await contract(env, emitter, "proxy");
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function beacon() view returns (address)",
        expect: beacon.address,
      },
      line`assert @proxies:beacon!(${target}) == ${beacon}`,
      say`${target} reports the beacon ${beacon}`,
    );
  },
});
