import {
  contract,
  defineEvent,
  line,
  say,
  stateCandidate,
} from "@evmcrispr/sdk";

export default defineEvent({
  name: "paused",
  description: "Pausable: the contract is paused after the run.",
  event: "event Paused(address account)",
  suggest: async (env, { emitter }) => {
    const target = await contract(env, emitter, "contract");
    return stateCandidate(
      env,
      {
        address: emitter,
        signature: "function paused() view returns (bool)",
        expect: true,
      },
      line`assert ${target}::!{paused()(bool)} == true`,
      say`${target} is paused`,
    );
  },
});
