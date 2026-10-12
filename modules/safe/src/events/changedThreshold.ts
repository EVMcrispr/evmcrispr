import {
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "changedThreshold",
  description: "Safe: the threshold after the run.",
  event: "event ChangedThreshold(uint256 threshold)",
  suggest: async (env, { emitter, logs }) => {
    const threshold = logs.at(-1)!.threshold as bigint;
    const target = await contract(env, emitter, "contract");
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function getThreshold() view returns (uint256)",
        expect: threshold,
      },
      line`assert @safe:threshold!(${target}) == ${threshold}`,
      say`${target} has a threshold of ${threshold}`,
    );
  },
});
