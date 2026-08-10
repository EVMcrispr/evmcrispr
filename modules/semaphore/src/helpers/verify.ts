import { defineHelper } from "@evmcrispr/sdk";
import type Semaphore from "..";
import { parseProofJson } from "../utils/proof";
import {
  parseGroupId,
  requireSemaphore,
  SEMAPHORE_ABI,
} from "../utils/semaphore";

export default defineHelper<Semaphore>({
  name: "verify",
  description:
    "Check a Semaphore membership proof against a group with the contract's view verifier: no transaction and no nullifier recording.",
  returnType: "bool",
  batchable: false,
  args: [
    {
      name: "proof",
      type: "string",
      description: "Proof JSON from semaphore:prove",
    },
    { name: "group", type: "number", description: "Group id" },
  ],
  async run(module, { proof, group }) {
    const { address } = await requireSemaphore(module);
    const parsed = parseProofJson(proof);
    const client = await module.getClient();
    const valid = (await client.readContract({
      address,
      abi: SEMAPHORE_ABI,
      functionName: "verifyProof",
      args: [
        parseGroupId(group),
        {
          merkleTreeDepth: parsed.merkleTreeDepth,
          merkleTreeRoot: parsed.merkleTreeRoot,
          nullifier: parsed.nullifier,
          message: parsed.message,
          scope: parsed.scope,
          points: parsed.points as [
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
          ],
        },
      ],
    })) as boolean;
    return valid ? "true" : "false";
  },
});
