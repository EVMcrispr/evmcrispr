import { defineHelper } from "@evmcrispr/sdk";
import type Safe from "..";
import { stringifySafeTransaction } from "../utils/offline";
import { mergeSafePackages } from "../utils/packages";
export default defineHelper<Safe>({
  name: "merge",
  description:
    "Merge matching Safe packages, EOA signatures, or explicit contract signatures without network access. Current authorization is checked by verify and execute.",
  returnType: "string",
  args: [
    {
      name: "package",
      type: "string",
      description: "Base transaction or message package JSON",
    },
    {
      name: "additions",
      type: "string",
      rest: true,
      description:
        "Package JSON, EOA signature bytes, or contract signature JSON",
    },
  ],
  async run(_, args) {
    return stringifySafeTransaction(
      await mergeSafePackages(args.package, args.additions),
    );
  },
});
