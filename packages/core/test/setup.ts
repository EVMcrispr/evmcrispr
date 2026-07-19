import { Module, type ModuleContext } from "@evmcrispr/sdk";
import { blockscout } from "@evmcrispr/test-utils/msw/blockscout";
import {
  createTestServer,
  HttpResponse,
  http,
} from "@evmcrispr/test-utils/msw/server";
import { tokenlistHandlers } from "@evmcrispr/test-utils/msw/tokenlist";
import { evml } from "../src";

/**
 * Minimal stub module registered on the test `evml` tag so the
 * cross-module loading machinery (completions, `getModule`, `getKeywords`)
 * can be exercised without depending on a real workspace module like
 * `@evmcrispr/module-aragonos`. Tests reference it by name (`coretest`)
 * and check for its single helper (`@coretest-helper`) and command
 * (`coretest-cmd`).
 */
class CoreTestModule extends Module {
  constructor(context: ModuleContext) {
    super(
      "coretest",
      {
        "coretest-cmd": {
          description: "Stub command exercised by core cross-module tests.",
          argDefs: [],
          optDefs: [],
          run: async () => [],
        },
      },
      {
        "coretest-helper": async () => "ok",
      },
      { "coretest-helper": "string" },
      { "coretest-helper": false },
      { "coretest-helper": [] },
      {
        "coretest-helper": "Stub helper exercised by core cross-module tests.",
      },
      { "coretest-cmd": "Stub command exercised by core cross-module tests." },
      {},
      {},
      context,
      [
        {
          name: "serviceUrl",
          type: "string",
          description: "Stub config with no default.",
        },
        {
          name: "endpoint",
          type: "string",
          description: "Stub config with a chain-dependent default.",
          default: "https://example.com/{chainId}",
        },
        {
          name: "target",
          type: "address",
          description: "Stub address-typed config.",
        },
      ],
    );
  }
}

evml.use({
  name: "coretest",
  load: async () => ({ default: CoreTestModule }),
});

const PINATA_AUTH = `Bearer ${process.env.VITE_PINATA_JWT}`;

const contentToCid: Record<string, string> = {
  "This should be pinned in IPFS":
    "QmeA34sMpR2EZfVdPsxYk7TMLxmQxhcgNer67UyTkiwKns",
};

// Served by the mocked IPFS gateway for `load --from` editor tests.
export const remoteModuleFixture = {
  cid: "QmCoreModuleFixture11111111111111111111111111",
  content: `def module extlib (
  def @twice "$n: number -> number" @num($n * 2)
  def go "$a: string" (
    print $a
  )
)`,
};

const coreHandlers = [
  http.get(
    "https://ipfs.blossom.software/ipfs/:cid",
    ({ params }: { params: { cid: string } }) => {
      if (params.cid === remoteModuleFixture.cid) {
        return new HttpResponse(remoteModuleFixture.content, {
          headers: { "Content-Type": "text/plain" },
        });
      }
      // Unknown CIDs fail fast so --from degradation tests stay offline.
      return new HttpResponse(null, { status: 404 });
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

const server = createTestServer(...tokenlistHandlers, ...coreHandlers);
server.listen({ onUnhandledRequest: "bypass" });
