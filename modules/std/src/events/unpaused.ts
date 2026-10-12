import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";

export default defineEvent({
  name: "unpaused",
  description: "Pausable: the contract is not paused after the run.",
  event: "event Unpaused(address account)",
  suggest: async (env, { emitter }) =>
    stateCandidate(
      env,
      {
        address: emitter,
        signature: "function paused() view returns (bool)",
        expect: false,
      },
      `assert ${emitter}::!{paused()(bool)} == false`,
      `${truncateAddress(emitter)} is not paused`,
    ),
});
