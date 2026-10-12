import {
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "minDelayChange",
  description: "TimelockController: the minimum delay after the run.",
  event: "event MinDelayChange(uint256 oldDuration, uint256 newDuration)",
  suggest: async (env, { emitter, logs }) => {
    const delay = logs.at(-1)!.newDuration as bigint;
    const target = await contract(env, emitter, "contract");
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function getMinDelay() view returns (uint256)",
        expect: delay,
      },
      line`assert @governor:timelockMinDelay!(${target}) == ${delay}`,
      say`${target} waits at least ${delay} seconds`,
    );
  },
});
