import { addressesEqual, IPFS_GATEWAY } from "@evmcrispr/sdk";
import { blockscout } from "@evmcrispr/test-utils/msw/blockscout";
import {
  createTestServer,
  HttpResponse,
  http,
} from "@evmcrispr/test-utils/msw/server";
import type { Address } from "viem";
import { artifacts } from "./artifacts";
import { DAOs, REPOs } from "./subgraph-data";
import tokenListFixture from "./tokenlist/uniswap.json";

const PINATA_AUTH = `Bearer ${process.env.VITE_PINATA_JWT}`;

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

  if (query.includes("query Repos")) {
    const selectedRepo = REPOs[variables.repoName as keyof typeof REPOs] as any;

    return HttpResponse.json({
      data: {
        repos: selectedRepo ? selectedRepo.data.repos : [],
      },
    });
  }

  if (query.includes("query Organization")) {
    const id = variables.id;

    const daoAddresses = Object.keys(DAOs);
    const dao =
      DAOs[
        daoAddresses.find((addr) =>
          addressesEqual(addr as Address, id as Address),
        ) as keyof typeof DAOs
      ];

    return HttpResponse.json({
      data: {
        organization: dao ? dao.data.organization : null,
      },
    });
  }
};

const coreHandlers = [
  http.post(
    "https://gateway-arbitrum.network.thegraph.com/api/458055b0bdee8336f889084f8378d7fa/subgraphs/id/BjzJNAmbkpTN3422j5rh3Gv7aejkDfRH1QLyoJC3qTMZ",
    handleSubgraphRequest,
  ),
  http.post(
    "https://api.thegraph.com/subgraphs/name/aragon/aragon-goerli",
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
  http.get<{ cid: string; resource: string }>(
    `${IPFS_GATEWAY}:cid/:resource`,
    ({ params }) => {
      const { cid, resource } = params;

      try {
        if (resource === "artifact.json") {
          const artifact = artifacts[cid as keyof typeof artifacts];

          if (!artifact) {
            return HttpResponse.error();
          }

          return HttpResponse.json(artifact);
        }
      } catch (err) {
        console.log(err);
      }
    },
  ),
  http.get("https://api.evmcrispr.com/abi/:chainId/:address", ({ params }) => {
    const address = (params.address as string).toLowerCase();
    const data = blockscout[address as keyof typeof blockscout];
    if (!data) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(JSON.parse(data.result));
  }),
  http.get("https://tokens.uniswap.org/", () => {
    return HttpResponse.json(tokenListFixture);
  }),
  http.post<
    Record<string, never>,
    { pinataContent: string },
    { IpfsHash: string } | { error: { reason: string; details: string } }
  >("https://api.pinata.cloud/pinning/pinJSONToIPFS", async ({ request }) => {
    const auth = request.headers.get("authorization");

    if (!auth || auth !== PINATA_AUTH) {
      return HttpResponse.json({
        error: {
          reason: "INVALID_CREDENTIALS",
          details: "Invalid/expired credentials",
        },
      });
    }

    const { pinataContent: content } = (await request.json()) as {
      pinataContent: keyof typeof contentToCid;
    };

    const contentToCid = {
      "This should be pinned in IPFS":
        "QmeA34sMpR2EZfVdPsxYk7TMLxmQxhcgNer67UyTkiwKns",
    };

    return HttpResponse.json({
      IpfsHash: contentToCid[content] ?? "",
    });
  }),
];

export const server = createTestServer(...coreHandlers);
