import {
  HttpResponse,
  http,
  passthrough,
} from "@evmcrispr/test-utils/msw/server";
import { ONE_BALANCE, W3F_UPLOAD_URL } from "../../src/addresses";
import { RUNNER_SCHEMA } from "../../src/runner/schema";
import { packTgz } from "../../src/utils/tgz";

/** CID the tests treat as the published EVML runner (EVMCRISPR_RUNNER_CID). */
export const TEST_RUNNER_CID =
  "QmTestEvmlRunnerCidEvmcrisprGelatoModule00000000";
/** CID of a user Web3 Function the mocked store knows, with typed user args. */
export const TEST_CID = "QmTestWeb3FunctionCidEvmcrisprGelatoModule0000000";
export const TEST_CID_USER_ARGS = { vault: "string", threshold: "number" };

/** Settlement the mocked 1Balance API publishes for TEST_SPONSOR. */
export const SETTLED_TOTAL = 40_000_000n;
export const SETTLED_PROOF = [
  "0x1111111111111111111111111111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222222222222222222222222222",
] as const;
/** Sponsors (account ids) the mocked 1Balance API knows a settlement for. */
export const settledSponsors = new Set<string>();

const archive = (userArgs: Record<string, string>) =>
  packTgz({
    "web3Function/schema.json": JSON.stringify({ ...RUNNER_SCHEMA, userArgs }),
  });

const storeArchives: Record<string, Record<string, string>> = {
  [TEST_RUNNER_CID]: RUNNER_SCHEMA.userArgs,
  [TEST_CID]: TEST_CID_USER_ARGS,
};

export const gelatoHandlers = [
  http.get(
    "https://api.gelato.digital/1balance/networks/mainnets/sponsors/:accountId",
    ({ params }) =>
      HttpResponse.json(
        settledSponsors.has(String(params.accountId).toLowerCase())
          ? {
              sponsor: {
                mainBalance: {
                  totalValidRequestedWithdrawAmount: SETTLED_TOTAL.toString(),
                },
              },
            }
          : { sponsor: {}, message: "getSponsorByAccountId" },
      ),
  ),
  http.get(
    "https://api.gelato.digital/1balance/networks/:chainId/tokens/:token/sponsors/:accountId/proof",
    ({ params }) =>
      settledSponsors.has(String(params.accountId).toLowerCase())
        ? HttpResponse.json({ merkleProof: SETTLED_PROOF })
        : HttpResponse.json({ message: "not found" }, { status: 404 }),
  ),
  // Native USDC on Polygon — the shared tokenlist mock only knows gnosis.
  http.get(`https://api.evmcrispr.com/tokenlist/${ONE_BALANCE.chainId}`, () =>
    HttpResponse.json({
      name: "test",
      tokens: [
        {
          chainId: ONE_BALANCE.chainId,
          address: ONE_BALANCE.usdc,
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
        },
        {
          chainId: ONE_BALANCE.chainId,
          address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
          symbol: "USDC.e",
          name: "Bridged USDC",
          decimals: 6,
        },
      ],
    }),
  ),
  // Gelato's function store: the archives the tests know, anything else live.
  http.get(`${W3F_UPLOAD_URL}/:cid`, async ({ params }) => {
    const userArgs = storeArchives[String(params.cid)];
    if (!userArgs) return passthrough();
    return new HttpResponse(await archive(userArgs), {
      headers: { "content-type": "application/gzip" },
    });
  }),
];
