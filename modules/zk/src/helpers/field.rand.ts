import { defineHelper, Num } from "@evmcrispr/sdk";
import type Zk from "..";
import { randomFieldElement } from "../utils/field";

export default defineHelper<Zk>({
  name: "field.rand",
  description:
    "Generate a uniformly random BN254 field element (rejection-sampled, no modulo bias) — for secrets, trapdoors and commitment salts.",
  returnType: "number",
  batchable: false,
  args: [],
  async run() {
    return Num.fromBigInt(randomFieldElement());
  },
});
