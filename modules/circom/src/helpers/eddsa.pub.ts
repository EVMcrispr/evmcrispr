import { defineHelper, Num } from "@evmcrispr/sdk";
import type Circom from "..";
import { derivePublicKey, parseSecret } from "../utils/eddsa";

export default defineHelper<Circom>({
  name: "eddsa.pub",
  description:
    "Derive the EdDSA public key (a Baby Jubjub point, as an [x y] pair) from a secret, the circom-ecosystem signature scheme used by Semaphore and MACI identities. The secret is sensitive: anything bound to a variable can be printed.",
  returnType: "array",
  args: [
    {
      name: "secret",
      type: "string",
      description: "Secret seed (any non-empty string or hex value)",
    },
  ],
  async run(_, { secret }) {
    const [x, y] = await derivePublicKey(parseSecret(secret, "secret"));
    return [Num.fromBigInt(x), Num.fromBigInt(y)];
  },
});
