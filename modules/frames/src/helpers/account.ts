import { type Address, defineHelper } from "@evmcrispr/sdk";
import type Frames from "..";
import { predictAccountAddress } from "../addresses";
import { saltValue } from "../salt";

export default defineHelper<Frames>({
  name: "account",
  batchable: false,
  description:
    "The address of an owner's frame account (salt default 0), whether or not it exists yet. Sends nothing.",
  returnType: "address",
  args: [
    {
      name: "owner",
      type: "address",
      description: "Owner of the account",
    },
    {
      name: "salt",
      type: "number",
      optional: true,
      description: "Which of the owner's accounts (default 0)",
    },
  ],
  async run(_module, { owner, salt }) {
    return predictAccountAddress(owner as Address, saltValue(salt, "salt"));
  },
});
