import type { DefaultBodyType, PathParams } from "msw";
import { HttpResponse, graphql, http } from "msw";
import { setupServer } from "msw/node";

import { utils } from "ethers";

import { artifacts } from "./artifacts/";
import { etherscan } from "./etherscan";
import { blockscout } from "./blockscout";
import { DAOs, REPOs } from "./subgraph-data";
import tokenListFixture from "./tokenlist/uniswap.json";
import { IPFS_GATEWAY } from "../../src/IPFSResolver";
import { addressesEqual } from "../../src/utils";

const PINATA_AUTH = `Bearer ${process.env.VITE_PINATA_JWT}`;
// const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API;

const handlers = [
  graphql.query<Record<string, any>, { repoName: string }>(
    "Repos",
    ({ variables }) => {
      const selectedRepo = REPOs[
        variables.repoName as keyof typeof REPOs
      ] as any;

      return HttpResponse.json({
        data: {
          repos: selectedRepo ? selectedRepo.data.repos : [],
        },
      });
    },
  ),
  graphql.query<Record<string, any>, { id: string }>(
    "Organization",
    ({ variables }) => {
      const id = variables.id;

      const daoAddresses = Object.keys(DAOs);
      const dao =
        DAOs[
          daoAddresses.find((addr) =>
            addressesEqual(addr, id),
          ) as keyof typeof DAOs
        ];

      return HttpResponse.json({
        data: {
          organization: dao ? dao.data.organization : null,
        },
      });
    },
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
    if (!address || !utils.isAddress(address)) {
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

    if (!address || !utils.isAddress(address)) {
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
