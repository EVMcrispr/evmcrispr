import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import type { Address } from "viem";
import { isAddressEqual } from "viem";
import { abiByAddress, systemAbi } from "./abis";
import { DAOs } from "./subgraph-data";

const handleSubgraphRequest = async ({
  request,
}: {
  request: Request;
}): Promise<Response | undefined> => {
  const body = (await request.json()) as {
    query: string;
    variables: Record<string, any>;
  };
  const query = body.query || "";
  const variables = body.variables || {};

  if (query.includes("query Organization")) {
    const id = variables.id;

    const daoAddresses = Object.keys(DAOs);
    const dao =
      DAOs[
        daoAddresses.find((addr) =>
          isAddressEqual(addr as Address, id as Address),
        ) as keyof typeof DAOs
      ];

    return HttpResponse.json({
      data: {
        organization: dao ? dao.data.organization : null,
      },
    });
  }
};

export const aragonosHandlers = [
  // Match each known subgraph URL explicitly (regex patterns don't work with Bun's MSW)
  http.post(
    "https://gateway-arbitrum.network.thegraph.com/api/458055b0bdee8336f889084f8378d7fa/subgraphs/id/BjzJNAmbkpTN3422j5rh3Gv7aejkDfRH1QLyoJC3qTMZ",
    handleSubgraphRequest,
  ),
  http.post(
    "https://gateway-arbitrum.network.thegraph.com/api/458055b0bdee8336f889084f8378d7fa/subgraphs/id/GHtDCXqSdwYPgXSigMA21yRpAWDwiAxqsfYsEw7NLMPk",
    handleSubgraphRequest,
  ),
  http.post(
    "https://gateway-arbitrum.network.thegraph.com/api/458055b0bdee8336f889084f8378d7fa/subgraphs/id/4xcBUyAqw61JTtP4SwvTw8f7RgRA6A1bxENatnK9cF33",
    handleSubgraphRequest,
  ),
  http.get(
    "https://api.evmcrispr.com/abi/:chainId/:address",
    ({ params }: { params: { address: string } }) => {
      const address = params.address.toLowerCase();
      const abi = abiByAddress[address as keyof typeof abiByAddress];

      return HttpResponse.json(abi ?? systemAbi);
    },
  ),
];
