import { defineHelper, Num } from "@evmcrispr/sdk";
import type Circom from "..";
import { parseProofJson } from "../utils/proof";

export default defineHelper<Circom>({
  name: "proof",
  description:
    "Project the proof JSON bound by circom:prove into the argument tuple of its snarkjs-exported verifier: [a b c signals] for groth16 (pi_b already swapped for the on-chain pairing check), [proof signals] for plonk/fflonk (a flat 24-element array). Destructure with `set [$a $b $c $signals] @circom:proof($proof)` or `set [$p $signals] @circom:proof($proof)`.",
  returnType: "array",
  args: [
    {
      name: "proof",
      type: "string",
      description: "Proof JSON string bound by circom:prove",
    },
  ],
  async run(_, { proof }) {
    const parsed = parseProofJson(proof);
    const num = (v: bigint) => Num.fromBigInt(v);
    if (parsed.protocol === "groth16") {
      return [
        parsed.a.map(num),
        parsed.b.map((pair) => pair.map(num)),
        parsed.c.map(num),
        parsed.signals.map(num),
      ];
    }
    return [parsed.proof.map(num), parsed.signals.map(num)];
  },
});
