import type { Module } from "../../..";
import { defineHelper } from "../../../utils";
import type { Giveth } from "../Giveth";

export const _projectAddr = async (
  module: Module,
  slug: string,
): Promise<[string, number]> => {
  const chainId = await module.getChainId();
  const result = await fetch(
    "https://corsproxy.evmcrispr.com/v0/https://mainnet.serve.giveth.io/graphql",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
        query GetProjectAddresses($slug: String!) {
          projectsBySlugs(slugs: [$slug]) {
            projects {
              id
              addresses {
                address
                networkId
              }
            }
          }
        }
        `,
        variables: {
          slug,
        },
      }),
    },
  )
    .then((res) => res.json())
    .then((res) => [
      res.data.projectsBySlugs.projects[0]?.addresses.find(
        (x: any) => x.networkId === chainId,
      )?.address,
      Number(res.data.projectsBySlugs.projects[0]?.id),
    ]);
  if (Number.isNaN(result[1])) {
    throw new Error("Project not found");
  }
  if (result[0] === undefined) {
    throw new Error("Project doesn't have an address on this chain");
  }
  return result as [string, number];
};

export const projectAddr = defineHelper<Giveth>({
  args: [{ name: "slug", type: "string" }],
  async run(module, { slug }) {
    return (await _projectAddr(module, slug))[0];
  },
});
