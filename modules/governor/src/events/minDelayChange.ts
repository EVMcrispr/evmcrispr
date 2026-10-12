import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";

export default defineEvent({
  name: "minDelayChange",
  description: "TimelockController: the minimum delay after the run.",
  event: "event MinDelayChange(uint256 oldDuration, uint256 newDuration)",
  suggest: async (env, { emitter, logs }) => {
    const delay = logs.at(-1)!.newDuration as bigint;
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function getMinDelay() view returns (uint256)",
        expect: delay,
      },
      `assert @governor:timelockMinDelay!(${emitter}) == ${delay}`,
      `${truncateAddress(emitter)} waits at least ${delay} seconds`,
    );
  },
});
