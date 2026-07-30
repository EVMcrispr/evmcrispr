import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { hexToBytes } from "viem";
import type Noir from "..";
import { verifyUltraHonk } from "../utils/barretenberg";
import { parseProofJson } from "../utils/proof";

export default defineHelper<Noir>({
  name: "verify",
  description:
    "Verify an UltraHonk proof off-chain against a verification key — no deployed verifier needed. The transcript (keccak or poseidon) is auto-detected from the proof JSON; the vkey must come from @noir:vkey with the matching oracle.",
  returnType: "bool",
  args: [
    {
      name: "proof",
      type: "string",
      description: "Proof JSON string bound by noir:prove",
    },
    {
      name: "vkey",
      type: "string",
      description: "Verification key as 0x-hex bytes (from @noir:vkey)",
    },
  ],
  async run(_, { proof, vkey }) {
    const parsed = parseProofJson(proof);
    if (!/^0x[0-9a-fA-F]+$/.test(vkey)) {
      throw new ErrorException(
        "<vkey> must be the 0x-hex verification key from @noir:vkey",
      );
    }
    const valid = await verifyUltraHonk(
      parsed,
      hexToBytes(vkey as `0x${string}`),
    );
    return valid ? "true" : "false";
  },
});
