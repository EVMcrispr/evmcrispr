import { defineHelper } from "@evmcrispr/sdk";
import type Safe from "..";
import { stringifySafeTransaction } from "../utils/offline";
import { mergeSafeSignables } from "../utils/signables";
export default defineHelper<Safe>({
  name: "merge",
  description:
    "Merge signatures into a Safe transaction or Safe message without network access: matching signed JSON, EOA signatures, or explicit contract signatures. Current authorization is checked by verify and execute.",
  returnType: "string",
  args: [
    {
      name: "base",
      type: "string",
      description: "Safe transaction or Safe message JSON",
    },
    {
      name: "additions",
      type: "string",
      rest: true,
      description:
        "Signed Safe transaction or Safe message JSON, EOA signature bytes, or contract signature JSON",
    },
  ],
  async run(_, args) {
    return stringifySafeTransaction(
      await mergeSafeSignables(args.base, args.additions),
    );
  },
});
