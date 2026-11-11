import { account, contract, defineEvent, line, say } from "@evmcrispr/sdk";
import { getAddress } from "viem";
import { implementationReadable } from "./_onchain";

export default defineEvent({
  name: "upgraded",
  description:
    "ERC-1967 and beacon upgrades: the implementation after the run, where an assertion can read it.",
  event: "event Upgraded(address indexed implementation)",
  suggest: async (env, { emitter, logs }) => {
    const implementation = account(
      logs.at(-1)!.implementation,
      "implementation",
    );
    if (
      !(await implementationReadable(
        env,
        getAddress(emitter),
        implementation.address,
      ))
    )
      return [];
    const target = await contract(env, emitter, "proxy");
    return [
      {
        line: line`assert @proxies:implementation!(${target}) == ${implementation}`,
        sentence: say`${target} reports the implementation ${implementation}`,
        kind: "state",
      },
    ];
  },
});
