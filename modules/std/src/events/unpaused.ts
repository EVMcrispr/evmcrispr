import {
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "unpaused",
  description: "Pausable: the contract is not paused after the run.",
  event: "event Unpaused(address account)",
  suggest: async (env, { emitter }) => {
    const target = await contract(env, emitter, "contract");
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function paused() view returns (bool)",
        expect: false,
      },
      line`assert ${target}::!{paused()(bool)} == false`,
      say`${target} is not paused`,
    );
  },
});
