import { defineHelper } from "@evmcrispr/sdk";
import { staticCallParam } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
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
  compileDescription:
    "The proof and group id are taken as constants; validity is judged against the group's state when the assertion runs, so a root rotation flips the answer.",
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
  // The proof tuple is all value types, so the whole call is one flat
  // literal staticcall; only the verdict is read at judgement.
  compile: async (ctx, node) => {
    const { address } = await requireSemaphore(ctx.module);
    const proof = parseProofJson(
      String(await ctx.interpreters.interpretNode(node.args[0])),
    );
    const group = parseGroupId(
      await ctx.interpreters.interpretNode(node.args[1]),
    );
    return {
      kind: "call",
      param: staticCallParam(
        address,
        encodeFunctionData({
          abi: SEMAPHORE_ABI,
          functionName: "verifyProof",
          args: [
            group,
            {
              merkleTreeDepth: proof.merkleTreeDepth,
              merkleTreeRoot: proof.merkleTreeRoot,
              nullifier: proof.nullifier,
              message: proof.message,
              scope: proof.scope,
              points: proof.points as [
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
        }),
      ),
      cat: "Bool",
    };
  },
});
