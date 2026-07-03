import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";

/** Mutable in-memory Safe Transaction Service used by the tests: proposals
 *  POSTed by `safe:propose` land in `proposals`; queued transactions for
 *  `safe:exec <hash>` are seeded into `transactions`. */
export const serviceState = {
  proposals: [] as any[],
  transactions: new Map<string, any>(),
  reset() {
    this.proposals = [];
    this.transactions.clear();
  },
};

// Anvil forks gnosis (chain id 100 -> "gno")
const BASE = "https://api.safe.global/tx-service/gno/api/v1";

export const safeServiceHandlers = [
  http.get(`${BASE}/safes/:safe/multisig-transactions/`, () =>
    HttpResponse.json({ count: 0, results: [] }),
  ),
  http.post(
    `${BASE}/safes/:safe/multisig-transactions/`,
    async ({ request }) => {
      serviceState.proposals.push(await request.json());
      return HttpResponse.json({}, { status: 201 });
    },
  ),
  http.get(`${BASE}/multisig-transactions/:hash/`, ({ params }) => {
    const tx = serviceState.transactions.get(String(params.hash).toLowerCase());
    if (!tx) {
      return HttpResponse.json({ detail: "Not found." }, { status: 404 });
    }
    return HttpResponse.json(tx);
  }),
];
