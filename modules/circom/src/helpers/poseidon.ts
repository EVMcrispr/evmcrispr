import { defineHelper, ErrorException, Num } from "@evmcrispr/sdk";
import type Circom from "..";
import { parseFieldInput } from "../utils/field";
import { loadPoseidon, MAX_POSEIDON_ARITY } from "../utils/poseidon";

export default defineHelper<Circom>({
  name: "poseidon",
  description:
    "Hash 1-16 field elements with the circomlib Poseidon permutation over the BN254 scalar field (the hash used by Semaphore, Tornado and most circom circuits).",
  returnType: "number",
  args: [
    {
      name: "inputs",
      type: "number",
      rest: true,
      description:
        "1-16 field elements to hash (numbers, decimal strings or hex values)",
    },
  ],
  async run(_, { inputs }) {
    const values = (inputs as unknown[]).map((v, i) =>
      parseFieldInput(v, `inputs[${i}]`),
    );
    if (values.length < 1 || values.length > MAX_POSEIDON_ARITY) {
      throw new ErrorException(
        `@circom:poseidon expects between 1 and ${MAX_POSEIDON_ARITY} inputs, got ${values.length}`,
      );
    }
    const poseidon = await loadPoseidon(values.length);
    return Num.fromBigInt(poseidon(values));
  },
});
