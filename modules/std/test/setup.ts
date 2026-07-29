import { encryptScript } from "@evmcrispr/sdk";
import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import {
  createTestServer,
  HttpResponse,
  http,
  passthrough,
} from "@evmcrispr/test-utils/msw/server";
import agnoImplAbi from "./fixtures/abis/agno-impl.json";
import agnoProxyAbi from "./fixtures/abis/agno-proxy.json";
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

// Contract with no verified ABI (the ABI endpoint 404s), used to exercise
// @abi.decodeCall's openchain fallback path.
export const unverifiedContract = "0x00000000000000000000000000000000deadbeef";

// Fixtures served by the mocked IPFS gateway (see handler below)
export const ipfsGatewayFixtures = {
  rawHex: {
    cid: "QmRawHexFixture11111111111111111111111111111111",
    content: `0x${"ab".repeat(100)}`,
  },
  missing: {
    cid: "QmMissingFixture333333333333333333333333333333",
  },
  // Plain EVML module file (with a leading comment) for `load --from`
  moduleFile: {
    cid: "QmModuleFixture444444444444444444444444444444",
    content: `# a math library
def module math (
  def @double "$n: number -> number" @num($n * 2)
  def pause "$n: number" (
    wait $n
  )
)`,
  },
  // Bare (unencrypted) share pin wrapping a module file
  moduleBarePin: {
    cid: "QmModuleBarePin5555555555555555555555555555555",
    content: {
      title: "math",
      script: `def module math (
  def @triple "$n: number -> number" @num($n * 3)
)`,
    },
  },
  // Invalid module file: more than one top-level command
  moduleTwoCommands: {
    cid: "QmModuleTwoCmds66666666666666666666666666666666",
    content: `def module math (
  def @double "$n: number -> number" @num($n * 2)
)
print "extra"`,
  },
  // Encrypted share envelope with an unknown key (missing-key error path)
  encryptedPin: {
    cid: "QmEncryptedPin7777777777777777777777777777777777",
    content: { encrypted: true, iv: "AAAA", data: "BBBB" },
  },
};

// Real encrypted share envelope wrapping a module file, for the
// `load --from ipfs://<cid>#<key>` decryption path.
const encryptedModuleScript = `def module math (
  def @quadruple "$n: number -> number" @num($n * 4)
)`;
const { envelope: encryptedModuleEnvelope, key: encryptedModuleKey } =
  await encryptScript({ title: "math", script: encryptedModuleScript });
export const encryptedModule = {
  cid: "QmEncryptedModule888888888888888888888888888888",
  key: encryptedModuleKey,
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
      if (cid === ipfsGatewayFixtures.missing.cid) {
        return new HttpResponse(null, { status: 404 });
      }
      if (cid === ipfsGatewayFixtures.moduleFile.cid) {
        return new HttpResponse(ipfsGatewayFixtures.moduleFile.content, {
          headers: { "Content-Type": "text/plain" },
        });
      }
      if (cid === ipfsGatewayFixtures.moduleBarePin.cid) {
        return HttpResponse.json(ipfsGatewayFixtures.moduleBarePin.content);
      }
      if (cid === ipfsGatewayFixtures.moduleTwoCommands.cid) {
        return new HttpResponse(ipfsGatewayFixtures.moduleTwoCommands.content, {
          headers: { "Content-Type": "text/plain" },
        });
      }
      if (cid === ipfsGatewayFixtures.encryptedPin.cid) {
        return HttpResponse.json(ipfsGatewayFixtures.encryptedPin.content);
      }
      if (cid === encryptedModule.cid) {
        return HttpResponse.json(encryptedModuleEnvelope);
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
      // Aave aGNO proxy + implementation, frozen so the exec-completions
      // proxy test never waits on the live ABI service (CI timeout flake).
      if (address === "0xc6b7aca6de8a6044e0e32d0c841a89244a10d284") {
        return HttpResponse.json(agnoProxyAbi);
      }
      if (address === "0xce579ae642e40f8356a9f538c6db4e2ea91c5850") {
        return HttpResponse.json(agnoImplAbi);
      }
      if (address === unverifiedContract.toLowerCase()) {
        return new HttpResponse(null, { status: 404 });
      }
      // Placeholder addresses (0x000…0001 and friends) used by completions
      // tests must not hit the live ABI service — a slow response blows the
      // 5s test timeout under CI load. Real contracts still pass through.
      if (/^0x0{24}/.test(address)) {
        return new HttpResponse(null, { status: 404 });
      }
      return passthrough();
    },
  ),
  // Openchain signature database, mocked unconditionally so decodeCall's
  // fallback path is deterministic and never rate-limited in tests.
  http.get(
    "https://api.openchain.xyz/signature-database/v1/lookup",
    ({ request }) => {
      const selector = new URL(request.url).searchParams.get("function");
      const known: Record<string, string> = {
        "0xa9059cbb": "transfer(address,uint256)",
      };
      const signature = selector ? known[selector] : undefined;
      return HttpResponse.json({
        result: {
          function: signature
            ? { [selector as string]: [{ name: signature }] }
            : {},
        },
      });
    },
  ),
];

// Create and start MSW server with shared + std handlers
export const server = createTestServer(...stdHandlers);
server.listen({ onUnhandledRequest: "bypass" });
