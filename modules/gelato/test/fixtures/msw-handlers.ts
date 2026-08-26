import {
  HttpResponse,
  http,
  passthrough,
} from "@evmcrispr/test-utils/msw/server";
import { ONE_BALANCE, W3F_UPLOAD_URL } from "../../src/addresses";

/** CID the mocked Gelato upload endpoint hands back. */
export const TEST_CID = "QmTestWeb3FunctionCidEvmcrisprGelatoModule0000000";

/** Bodies received by the mocked upload endpoint, newest last. */
export const uploads: { title: string | null; bytes: number }[] = [];

/** Settlement the mocked 1Balance API publishes for TEST_SPONSOR. */
export const SETTLED_TOTAL = 40_000_000n;
export const SETTLED_PROOF = [
  "0x1111111111111111111111111111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222222222222222222222222222",
] as const;
/** Sponsors (account ids) the mocked 1Balance API knows a settlement for. */
export const settledSponsors = new Set<string>();

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
  // The store has never seen a simulation's placeholder CID.
  http.get(`${W3F_UPLOAD_URL}/:cid`, ({ params }) =>
    String(params.cid).startsWith("simulated-")
      ? new HttpResponse(null, { status: 404 })
      : passthrough(),
  ),
  http.post(W3F_UPLOAD_URL, async ({ request }) => {
    const form = await request.formData();
    const file = form.get("file");
    uploads.push({
      title: form.get("title") as string | null,
      bytes: file instanceof Blob ? file.size : 0,
    });
    return HttpResponse.json({ cid: TEST_CID });
  }),
];
