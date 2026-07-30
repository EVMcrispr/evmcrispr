import { defineHelper, Num } from "@evmcrispr/sdk";
import type Zk from "..";
import { parseSecret, signMessage } from "../utils/eddsa";
import { parseFieldInput } from "../utils/field";

export default defineHelper<Zk>({
  name: "eddsa.sign",
  description:
    "Sign a field-element message with EdDSA over Baby Jubjub (Poseidon variant), returning the signature as [R8x R8y S] — destructure or pass whole to @zk:eddsa.verify or into circuit inputs.",
  returnType: "array",
  args: [
    {
      name: "secret",
      type: "string",
      description: "Secret seed the signing key derives from",
    },
    {
      name: "message",
      type: "number",
      description: "Field-element message to sign (hash larger data first)",
    },
  ],
  async run(_, { secret, message }) {
    const { r8, s } = await signMessage(
      parseSecret(secret, "secret"),
      parseFieldInput(message, "message"),
    );
    return [Num.fromBigInt(r8[0]), Num.fromBigInt(r8[1]), Num.fromBigInt(s)];
  },
});
