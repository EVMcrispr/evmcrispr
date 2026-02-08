import type { DefaultBodyType, PathParams } from "msw";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { Address } from "viem";
import { isAddress } from "viem";
import { IPFS_GATEWAY } from "../../src/IPFSResolver";
import { addressesEqual } from "../../src/utils";
import { artifacts } from "./artifacts/";
import { blockscout } from "./blockscout";
import { etherscan } from "./etherscan";
import { DAOs, REPOs } from "./subgraph-data";
import tokenListFixture from "./tokenlist/uniswap.json";

const PINATA_AUTH = `Bearer ${process.env.VITE_PINATA_JWT}`;
// const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API;

// Use http.post instead of graphql.query because MSW's graphql handlers
// don't work reliably with Bun's native fetch implementation.
// Use a regex to match all subgraph URLs across different chains.
const subgraphUrlPattern =
  /^https:\/\/(gateway-arbitrum\.network\.thegraph\.com|api\.thegraph\.com)\//;

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

const handlers = [
  // Match each known subgraph URL explicitly (regex patterns don't work with Bun's MSW)
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
  http.get<
    PathParams<string>,
    DefaultBodyType,
    { status: string; message: string; result: string }
  >(`https://api-rinkeby.etherscan.io/api`, ({ request }) => {
    const address = new URL(request.url).searchParams.get("address");
    if (!address || !isAddress(address)) {
      return HttpResponse.json({
        status: "0",
        message: "NOTOK",
        result: "Invalid Address format",
      });
    }

    const data = etherscan[address.toLowerCase() as keyof typeof etherscan];

    if (!data) {
      return HttpResponse.json({
        status: "0",
        message: "NOTOK",
        result: "Contract source code not verified",
      });
    }

    return HttpResponse.json(data);
  }),
  http.get<
    { address: string },
    { address: string },
    { status: string; message: string; result: string }
  >(`https://blockscout.com/xdai/mainnet/api`, ({ request }) => {
    const address = new URL(request.url).searchParams.get("address");

    if (!address || !isAddress(address)) {
      return HttpResponse.json({
        status: "0",
        message: "NOTOK",
        result: "Invalid Address format",
      });
    }

    const data = blockscout[address.toLowerCase() as keyof typeof blockscout];

    if (!data) {
      return HttpResponse.json({
        status: "0",
        message: "NOTOK",
        result: "Contract source code not verified",
      });
    }

    return HttpResponse.json(data);
  }),
  http.get<PathParams<string>, DefaultBodyType, DefaultBodyType>(
    "https://tokens.uniswap.org/",
    () => {
      return HttpResponse.json(tokenListFixture);
    },
  ),
  http.post<
    PathParams<string>,
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

export const server = setupServer(...handlers);
