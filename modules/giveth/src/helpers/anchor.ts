import { defineHelper } from "@evmcrispr/sdk";
import type Giveth from "..";
import { fetchProject, getAnchor } from "../utils/graphql";

export default defineHelper<Giveth>({
  name: "anchor",
  description:
    "Resolve a Giveth project slug to its anchor contract on the current chain — the receiver of recurring donations, streamed with the superfluid module. Anchor contracts exist on Optimism and Base only.",
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
    return getAnchor(project, await module.getChainId());
  },
});
