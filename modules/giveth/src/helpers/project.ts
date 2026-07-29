import { defineHelper } from "@evmcrispr/sdk";
import type Giveth from "..";
import { fetchProject, getRecipientAddress } from "../utils/graphql";

export default defineHelper<Giveth>({
  name: "project",
  description:
    "Resolve a Giveth project slug to its donation recipient address on the current chain.",
  returnType: "address",
  args: [
    {
      name: "slug",
      type: "giveth-project",
      description: "Giveth project slug",
    },
  ],
  async run(module, { slug }) {
    const project = await fetchProject(module, slug);
    return getRecipientAddress(project, await module.getChainId());
  },
});
