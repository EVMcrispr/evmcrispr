import { defineHelper } from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { resolveRepoAddress } from "../utils/repos";

export default defineHelper<AragonOSx>({
  name: "repo",
  description: "Resolve a plugin repo subdomain to its PluginRepo address.",
  returnType: "address",
  batchable: false,
  args: [
    {
      name: "subdomain",
      type: "string",
      description: "Repo subdomain (e.g. `token-voting`) or address",
    },
  ],
  async run(module, { subdomain }) {
    return resolveRepoAddress(module, subdomain);
  },
});
