import { defineEvent, stateCandidate, truncateAddress } from "@evmcrispr/sdk";

export default defineEvent({
  name: "paused",
  description: "Pausable: the contract is paused after the run.",
  event: "event Paused(address account)",
  suggest: async (env, { emitter }) =>
    stateCandidate(
      env,
      {
        address: emitter,
        signature: "function paused() view returns (bool)",
        expect: true,
      },
      `assert ${emitter}::!{paused()(bool)} == true`,
      `${truncateAddress(emitter)} is paused`,
    ),
});
