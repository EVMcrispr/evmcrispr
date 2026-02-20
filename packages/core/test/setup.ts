import { blockscout } from "@evmcrispr/test-utils/msw/blockscout";
import {
  createTestServer,
  HttpResponse,
  http,
} from "@evmcrispr/test-utils/msw/server";
import { aragonosHandlers } from "../../../modules/aragonos/test/fixtures/msw-handlers";
import tokenListFixture from "../../../modules/std/test/fixtures/tokenlist/uniswap.json";
import { EVMcrispr } from "../src/EVMcrispr";

EVMcrispr.registerModule(
  "aragonos",
  () => import("@evmcrispr/module-aragonos"),
);
EVMcrispr.registerModule("sim", () => import("@evmcrispr/module-sim"));
EVMcrispr.registerModule("giveth", () => import("@evmcrispr/module-giveth"));
EVMcrispr.registerModule("ens", () => import("@evmcrispr/module-ens"));

const PINATA_AUTH = `Bearer ${process.env.VITE_PINATA_JWT}`;

const contentToCid: Record<string, string> = {
  "This should be pinned in IPFS":
    "QmeA34sMpR2EZfVdPsxYk7TMLxmQxhcgNer67UyTkiwKns",
};

const coreHandlers = [
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
      pinataContent: string;
    };
    return HttpResponse.json({
      IpfsHash: contentToCid[content] ?? "",
    });
  }),
];

const server = createTestServer(...aragonosHandlers, ...coreHandlers);
server.listen({ onUnhandledRequest: "bypass" });
