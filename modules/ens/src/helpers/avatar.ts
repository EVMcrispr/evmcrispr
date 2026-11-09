import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { normalize } from "viem/ens";
import type Ens from "..";
import { ensClient } from "../utils";

export default defineHelper<Ens>({
  name: "avatar",
  batchable: false,
  description: "Avatar URI of an ENS name.",
  returnType: "string",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
  ],
  async run(module, { name }, { node }) {
    const client = await ensClient(module);
    const avatar = await client.getEnsAvatar({ name: normalize(name) });
    if (!avatar) {
      throw new HelperFunctionError(node, `no avatar found for ${name}`);
    }
    return avatar;
  },
});
