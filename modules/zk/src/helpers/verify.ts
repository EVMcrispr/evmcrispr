import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type Zk from "..";
import { parseProofJson } from "../utils/proof";
import { verifyProof } from "../utils/snarkjs";

export default defineHelper<Zk>({
  name: "verify",
  description:
    "Verify a proof off-chain against a verification key (groth16, plonk or fflonk auto-detected from the proof) — no deployed verifier needed. Get the vkey from @zk:circom.vkey or a hosted vkey JSON.",
  returnType: "bool",
  args: [
    {
      name: "proof",
      type: "string",
      description: "Proof JSON string bound by zk:prove",
    },
    {
      name: "vkey",
      type: "string",
      description:
        "Verification key JSON (from @zk:circom.vkey, @http:fetch or @ipfs.get)",
    },
  ],
  async run(_, { proof, vkey }) {
    const parsed = parseProofJson(proof);
    let vkeyObject: Record<string, unknown>;
    try {
      vkeyObject = JSON.parse(vkey);
    } catch {
      throw new ErrorException("<vkey> must be a verification key JSON string");
    }
    const raw = JSON.parse(proof) as {
      proof: Record<string, unknown>;
      publicSignals: unknown[];
    };
    const valid = await verifyProof(
      parsed.protocol,
      vkeyObject,
      raw.publicSignals,
      raw.proof,
    );
    return valid ? "true" : "false";
  },
});
