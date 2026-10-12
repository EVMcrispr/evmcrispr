import {
  account,
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "adminChanged",
  description: "ERC-1967 admin changes, where the proxy exposes its admin.",
  event: "event AdminChanged(address previousAdmin, address newAdmin)",
  suggest: async (env, { emitter, logs }) => {
    const admin = account(logs.at(-1)!.newAdmin, "admin");
    const target = await contract(env, emitter, "proxy");
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function admin() view returns (address)",
        expect: admin.address,
      },
      line`assert @proxies:admin!(${target}) == ${admin}`,
      say`${target} reports the admin ${admin}`,
    );
  },
});
