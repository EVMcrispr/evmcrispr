import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import {
  createTestServer,
  HttpResponse,
  http,
  passthrough,
} from "@evmcrispr/test-utils/msw/server";
import daiAbi from "./fixtures/abis/dai.json";
import wxdaiAbi from "./fixtures/abis/wxdai.json";

registerAllModules();
// Re-register contracts with a local loader: the registry's own dynamic
// import resolves from test-utils, whose isolated node_modules doesn't
// link that package. Needed by cross-module batch deploy tests.
evml.use({
  name: "contracts",
  load: () => import("@evmcrispr/module-contracts"),
});

// Fixtures served by the mocked IPFS gateway (see handler below)
export const ipfsGatewayFixtures = {
  rawHex: {
    cid: "QmRawHexFixture11111111111111111111111111111111",
    content: `0x${"ab".repeat(100)}`,
  },
  // Content pinned via pinJSONToIPFS (the @ipfs helper) is JSON-quoted
  quoted: {
    cid: "QmQuotedFixture2222222222222222222222222222222",
    content: "0xdeadbeef",
  },
  missing: {
    cid: "QmMissingFixture333333333333333333333333333333",
  },
};

// Std-specific MSW handlers (ABI endpoint)
const stdHandlers = [
  http.get(
    "https://ipfs.blossom.software/ipfs/:cid",
    ({ params }: { params: { cid: string } }) => {
      const { cid } = params;
      if (cid === ipfsGatewayFixtures.rawHex.cid) {
        return new HttpResponse(ipfsGatewayFixtures.rawHex.content, {
          headers: { "Content-Type": "text/plain" },
        });
      }
      if (cid === ipfsGatewayFixtures.quoted.cid) {
        return HttpResponse.json(ipfsGatewayFixtures.quoted.content);
      }
      if (cid === ipfsGatewayFixtures.missing.cid) {
        return new HttpResponse(null, { status: 404 });
      }
      return passthrough();
    },
  ),
  http.get(
    "https://api.evmcrispr.com/abi/:chainId/:address",
    ({ params }: { params: { address: string } }) => {
      const address = (params.address as string).toLowerCase();
      if (address === "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d") {
        return HttpResponse.json(wxdaiAbi);
      }
      if (address === "0xf8d1677c8a0c961938bf2f9adc3f3cfda759a9d9") {
        return HttpResponse.json(daiAbi);
      }
      return passthrough();
    },
  ),
];

// Create and start MSW server with shared + std handlers
export const server = createTestServer(...stdHandlers);
server.listen({ onUnhandledRequest: "bypass" });
