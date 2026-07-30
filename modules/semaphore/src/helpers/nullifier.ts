import { loadPoseidon2, parseFieldInput } from "@evmcrispr/module-circom";
import { defineHelper, Num } from "@evmcrispr/sdk";
import type Semaphore from "..";
import { hashSignal, parseSignalValue } from "../utils/proof";

export default defineHelper<Semaphore>({
  name: "nullifier",
  description:
    "The nullifier a stored identity produces for a scope (poseidon of the hashed scope and the identity secret) — what the contract records on validateProof; useful to check whether a signal was already sent.",
  returnType: "number",
  args: [
    { name: "scope", type: "any", description: "Scope (external nullifier)" },
    {
      name: "commitment",
      type: "number",
      optional: true,
      description:
        "Identity commitment (default: the only identity of this session)",
    },
  ],
  async run(module, { scope, commitment }) {
    const identity = module.requireIdentity(
      commitment !== undefined
        ? parseFieldInput(commitment, "commitment")
        : undefined,
    );
    const h = await loadPoseidon2();
    return Num.fromBigInt(
      h(hashSignal(parseSignalValue(scope, "scope")), identity.secretScalar),
    );
  },
});
