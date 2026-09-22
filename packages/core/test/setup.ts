import {
  defineCommand,
  defineHelper,
  Module,
  type ModuleContext,
} from "@evmcrispr/sdk";
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
 *
 * It also carries a declaring pair — the command `risky` and the helper
 * `@hfail` — so the editor features can be exercised against real declared
 * errors: `Shared` is declared by both with different signatures (an
 * ambiguous bare name) and `Twin` identically by both (one deduped entry).
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
        risky: defineCommand({
          name: "risky",
          args: [{ name: "value", type: "any", optional: true }],
          errors: {
            BelowMinimum: {
              description: "A part is worth less than the minimum order value",
              fields: [{ name: "minimum", type: "number" }],
            },
            SameToken: { description: "The sell and buy token are the same" },
            Shared: {
              description: "Declared by the command with a code",
              fields: [{ name: "code", type: "number" }],
            },
            Twin: { description: "Declared identically by both owners" },
          },
          run: async () => [],
        }),
      },
      {
        "coretest-helper": async () => "ok",
        hfail: defineHelper({
          name: "hfail",
          args: [],
          errors: {
            NoExplorer: {
              description: "The chain has no supported explorer",
              fields: [{ name: "chain", type: "number" }],
            },
            Shared: { description: "Declared by the helper without fields" },
            Twin: { description: "Declared identically by both owners" },
          },
          run: async () => "ok",
        }),
      },
      { "coretest-helper": "string", hfail: "string" },
      { "coretest-helper": false, hfail: false },
      { "coretest-helper": [], hfail: [] },
      {
        "coretest-helper": "Stub helper exercised by core cross-module tests.",
        hfail: "Stub helper that declares errors.",
      },
      {
        "coretest-cmd": "Stub command exercised by core cross-module tests.",
        risky: "Stub command that declares errors.",
      },
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

/**
 * A verified contract whose ABI carries a custom error, served by the ABI
 * endpoint the editor uses. Capture completions offer its errors only when
 * this ABI is already in the editor's cache — never by fetching it.
 */
export const customErrorContract = {
  address: "0x00000000000000000000000000000000000c0de5",
  abi: [
    {
      type: "function",
      name: "risk",
      stateMutability: "nonpayable",
      inputs: [{ name: "amount", type: "uint256" }],
      outputs: [],
    },
    {
      type: "error",
      name: "NotEnough",
      inputs: [
        { name: "available", type: "uint256" },
        { name: "required", type: "uint256" },
      ],
    },
  ],
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
    if (address === customErrorContract.address) {
      return HttpResponse.json(customErrorContract.abi);
    }
    const data = blockscout[address as keyof typeof blockscout];
    if (!data) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(JSON.parse(data.result));
  }),
];

const server = createTestServer(...tokenlistHandlers, ...coreHandlers);
server.listen({ onUnhandledRequest: "bypass" });
