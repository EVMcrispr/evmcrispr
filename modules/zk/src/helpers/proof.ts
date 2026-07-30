import { defineHelper, Num } from "@evmcrispr/sdk";
import type Zk from "..";
import { parseProofJson } from "../utils/proof";

export default defineHelper<Zk>({
  name: "proof",
  description:
    "Project the proof JSON bound by zk:prove into the `[a b c signals]` argument tuple of a snarkjs-exported Groth16 verifier (pi_b already swapped for the on-chain pairing check). Destructure it with `set [$a $b $c $signals] @zk:proof($proof)`.",
  returnType: "array",
  args: [
    {
      name: "proof",
      type: "string",
      description: "Proof JSON string bound by zk:prove",
    },
  ],
  async run(_, { proof }) {
    const { a, b, c, signals } = parseProofJson(proof);
    const num = (v: bigint) => Num.fromBigInt(v);
    return [
      a.map(num),
      b.map((pair) => pair.map(num)),
      c.map(num),
      signals.map(num),
    ];
  },
});
