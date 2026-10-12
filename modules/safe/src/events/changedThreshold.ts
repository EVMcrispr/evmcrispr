import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";

export default defineEvent({
  name: "changedThreshold",
  description: "Safe: the threshold after the run.",
  event: "event ChangedThreshold(uint256 threshold)",
  suggest: async (env, { emitter, logs }) => {
    const threshold = logs.at(-1)!.threshold as bigint;
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function getThreshold() view returns (uint256)",
        expect: threshold,
      },
      `assert @safe:threshold!(${emitter}) == ${threshold}`,
      `${truncateAddress(emitter)} needs ${threshold} signatures`,
    );
  },
});
