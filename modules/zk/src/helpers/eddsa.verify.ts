import { defineHelper } from "@evmcrispr/sdk";
import type Zk from "..";
import { verifySignature } from "../utils/eddsa";
import { parseFieldArray, parseFieldInput } from "../utils/field";

export default defineHelper<Zk>({
  name: "eddsa.verify",
  description:
    "Verify an EdDSA (Baby Jubjub, Poseidon variant) signature: the [R8x R8y S] array from @zk:eddsa.sign against a message and an [x y] public key.",
  returnType: "bool",
  args: [
    {
      name: "message",
      type: "number",
      description: "Field-element message that was signed",
    },
    {
      name: "signature",
      type: "array",
      description: "Signature as [R8x R8y S]",
    },
    {
      name: "pubkey",
      type: "array",
      description: "Public key as [x y] (from @zk:eddsa.pub)",
    },
  ],
  async run(_, { message, signature, pubkey }) {
    const sig = parseFieldArray(signature, "signature");
    const pub = parseFieldArray(pubkey, "pubkey");
    if (sig.length !== 3 || pub.length !== 2) {
      return "false";
    }
    const valid = await verifySignature(
      parseFieldInput(message, "message"),
      [sig[0], sig[1]],
      sig[2],
      [pub[0], pub[1]],
    );
    return valid ? "true" : "false";
  },
});
