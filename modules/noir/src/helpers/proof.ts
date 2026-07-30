import { defineHelper } from "@evmcrispr/sdk";
import type Noir from "..";
import { parseProofJson } from "../utils/proof";

export default defineHelper<Noir>({
  name: "proof",
  description:
    "Project the proof JSON bound by noir:prove into the argument tuple of its Solidity UltraHonk verifier: [proof publicInputs] for verify(bytes,bytes32[])(bool). Destructure with `set [$p $signals] @noir:proof($proof)`.",
  returnType: "array",
  args: [
    {
      name: "proof",
      type: "string",
      description: "Proof JSON string bound by noir:prove",
    },
  ],
  async run(_, { proof }) {
    const parsed = parseProofJson(proof);
    return [parsed.proof, parsed.publicInputs];
  },
});
