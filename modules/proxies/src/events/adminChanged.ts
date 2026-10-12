import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";
import { getAddress } from "viem";

export default defineEvent({
  name: "adminChanged",
  description: "ERC-1967 admin changes, where the proxy exposes its admin.",
  event: "event AdminChanged(address previousAdmin, address newAdmin)",
  suggest: async (env, { emitter, logs }) => {
    const admin = getAddress(logs.at(-1)!.newAdmin);
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function admin() view returns (address)",
        expect: admin,
      },
      `assert @proxies:admin!(${emitter}) == ${admin}`,
      `${truncateAddress(emitter)} reports the admin ${truncateAddress(admin)}`,
    );
  },
});
