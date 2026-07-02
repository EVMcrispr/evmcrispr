import { defineHelper } from "@evmcrispr/sdk";
import type Ens from "..";
import { decodeFuses } from "../fuses";

export default defineHelper<Ens>({
  name: "ens.fuses.decode",
  description: "Decode a NameWrapper fuse bitmap into its fuse names.",
  returnType: "array",
  args: [
    {
      name: "fuses",
      type: "number",
      description: "uint32 fuse bitmap (e.g. from @ens.fuses.of)",
    },
  ],
  async run(_, { fuses }) {
    return decodeFuses(Number(fuses));
  },
});
