import { defineHelper, Num } from "@evmcrispr/sdk";
import type Ens from "..";
import { encodeFuses } from "../fuses";

export default defineHelper<Ens>({
  name: "fuses",
  description: "Combine NameWrapper fuse names into their uint32 bitmap.",
  returnType: "number",
  args: [
    {
      name: "first",
      type: "fuse",
      description: 'First fuse name (e.g. "cannot-unwrap")',
    },
    {
      name: "rest",
      type: "fuse",
      rest: true,
      description: "Additional fuse names",
    },
  ],
  async run(_, { first, rest }) {
    return Num.fromBigInt(BigInt(encodeFuses([first, ...rest])));
  },
});
