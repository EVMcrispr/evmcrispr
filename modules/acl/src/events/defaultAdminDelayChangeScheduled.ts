import { contract, defineEvent, line, say } from "@evmcrispr/sdk";
import { firstWordCandidate } from "./_shared";

export default defineEvent({
  name: "defaultAdminDelayChangeScheduled",
  description:
    "AccessControlDefaultAdminRules: the pending default admin delay.",
  event:
    "event DefaultAdminDelayChangeScheduled(uint48 newDelay, uint48 effectSchedule)",
  suggest: async (env, { emitter, logs }) => {
    const delay = Number(logs.at(-1)!.newDelay);
    const target = await contract(env, emitter, "contract");
    return firstWordCandidate(
      env,
      {
        address: emitter,
        signature:
          "function pendingDefaultAdminDelay() view returns (uint48, uint48)",
        expect: delay,
      },
      line`assert ${target}::!{pendingDefaultAdminDelay()(uint48,uint48)}[$ _] == ${delay}`,
      say`The pending default admin delay of ${target} is ${delay} seconds`,
    );
  },
});
