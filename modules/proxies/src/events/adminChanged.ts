import { account, contract, defineEvent, line, say } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import { adminReadable } from "./_onchain";

export default defineEvent({
  name: "adminChanged",
  description: "ERC-1967 admin changes, where an assertion can read the admin.",
  event: "event AdminChanged(address previousAdmin, address newAdmin)",
  suggest: async (env, { emitter, logs }) => {
    const admin = account(logs.at(-1)!.newAdmin, "admin");
    if (!(await adminReadable(env, getAddress(emitter), admin.address)))
      return [];
    const target = await contract(env, emitter, "proxy");
    return [
      {
        line: line`assert @proxies:admin!(${target}) == ${admin}`,
        sentence: say`${target} reports the admin ${admin}`,
        kind: "state",
      },
    ];
  },
});
