import { evml, registerAllModules } from "@evmcrispr/test-utils/evml";
import {
  createTestServer,
  HttpResponse,
  http,
} from "@evmcrispr/test-utils/msw/server";

registerAllModules();
// Re-register with a local loader: the registry's own dynamic import
// resolves from test-utils, whose isolated node_modules doesn't link this
// package.
evml.use({ name: "receipts", load: () => import("../src/index") });

const WXDAI = "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d";

/** Just enough WXDAI ABI to decode the fixture deposit() tx and its
 *  Deposit event in the @receipts:tx summary tests. */
const WXDAI_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { indexed: true, internalType: "address", name: "dst", type: "address" },
      { internalType: "uint256", name: "wad", type: "uint256" },
    ],
    anonymous: false,
  },
];

// The @receipts:tx summary enriches via verified names (Blockscout when the
// Etherscan mock reports unverified), the ABI service and openchain. All
// three must be deterministic — live latency here blew CI test timeouts.
const enrichmentHandlers = [
  http.get("https://gnosis.blockscout.com/api", ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get("action") === "txlist") {
      const limit = Number(url.searchParams.get("offset") ?? "10");
      const entries = [
        {
          hash: "0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13",
          from: "0xced608aa29bb92185d9b6340adcbfa263dae075b",
          to: WXDAI,
          value: "100000000000000000",
          blockNumber: "11173946",
          timeStamp: "1595862470",
          isError: "0",
          txreceipt_status: "1",
          methodId: "0xd0e30db0",
        },
        {
          hash: "0x0c2632fc6588506d3a6a1cdb10140bb9281f898f6c1b532728409c623ca8432b",
          from: "0xced608aa29bb92185d9b6340adcbfa263dae075b",
          to: "",
          value: "0",
          blockNumber: "11173937",
          timeStamp: "1595862425",
          isError: "0",
          txreceipt_status: "1",
        },
      ];
      return HttpResponse.json({
        status: "1",
        message: "OK",
        result: entries.slice(0, limit),
      });
    }
    if (
      url.searchParams.get("action") === "getsourcecode" &&
      url.searchParams.get("address")?.toLowerCase() === WXDAI
    ) {
      return HttpResponse.json({
        status: "1",
        message: "OK",
        result: [
          {
            SourceCode: "contract WXDAI {}",
            ABI: JSON.stringify(WXDAI_ABI),
            ContractName: "WXDAI",
            CompilerVersion: "v0.4.22+commit.4cb486ee",
            OptimizationUsed: "false",
            EVMVersion: "default",
            FileName: "contracts/WXDAI.sol",
            IsProxy: "false",
            Address: WXDAI,
          },
        ],
      });
    }
    // Unverified shape: bare Address entry.
    return HttpResponse.json({
      status: "1",
      message: "OK",
      result: [{ Address: url.searchParams.get("address") ?? "" }],
    });
  }),
  http.get("https://api.evmcrispr.com/abi/:chainId/:address", ({ params }) => {
    if ((params.address as string).toLowerCase() === WXDAI) {
      return HttpResponse.json(WXDAI_ABI);
    }
    return new HttpResponse(null, { status: 404 });
  }),
  http.get("https://api.openchain.xyz/signature-database/v1/lookup", () =>
    HttpResponse.json({
      ok: true,
      result: {
        function: { "0xd0e30db0": [{ name: "deposit()", filtered: false }] },
      },
    }),
  ),
];

// Create and start MSW server
export const server = createTestServer(...enrichmentHandlers);
server.listen({ onUnhandledRequest: "bypass" });
