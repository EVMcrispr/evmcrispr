import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Semaphore from "..";
import { parseProofJson } from "../utils/proof";
import { parseGroupId, requireSemaphore } from "../utils/semaphore";

export default defineCommand<Semaphore>({
  name: "validate",
  description:
    "Validate a Semaphore membership proof on-chain. The contract records the nullifier, so a second proof with the same identity and scope reverts.",
  args: [
    {
      name: "proof",
      type: "string",
      description: "Proof JSON from semaphore:prove",
    },
    { name: "for", type: "command", description: "Keyword `for`" },
    { name: "group", type: "number", description: "Group id" },
  ],
  completions: { for: () => [fieldItem("for")] },
  async run(module, { proof, for: forKeyword, group }) {
    if (forKeyword !== "for") {
      throw new ErrorException(`expected keyword "for", got "${forKeyword}"`);
    }
    const { address } = await requireSemaphore(module);
    const parsed = parseProofJson(proof);
    return [
      encodeAction(
        address,
        "validateProof(uint256,(uint256,uint256,uint256,uint256,uint256,uint256[8]))",
        [
          Num.fromBigInt(parseGroupId(group)),
          [
            Num.fromBigInt(parsed.merkleTreeDepth),
            Num.fromBigInt(parsed.merkleTreeRoot),
            Num.fromBigInt(parsed.nullifier),
            Num.fromBigInt(parsed.message),
            Num.fromBigInt(parsed.scope),
            parsed.points.map(Num.fromBigInt),
          ],
        ],
      ),
    ];
  },
});
