import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { recoverMessageAddress } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "msgAddr",
  description: "Recover the signer address from a message and its signature.",
  returnType: "address",
  args: [
    { name: "message", type: "string", description: "The original message that was signed" },
    { name: "signature", type: "bytes", description: "The hex-encoded signature" },
  ],
  async run(_, { message, signature }, { node }) {
    try {
      return await recoverMessageAddress({ message, signature });
    } catch (err) {
      throw new HelperFunctionError(
        node,
        `failed to recover address: ${(err as Error).message}`,
      );
    }
  },
});
