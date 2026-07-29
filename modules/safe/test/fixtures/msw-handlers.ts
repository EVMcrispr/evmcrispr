import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";

/** Mutable in-memory Safe Transaction Service used by the tests: proposals
 *  POSTed by `safe:propose` land in `proposals`; queued transactions for
 *  `safe:execute <hash>` are seeded into `transactions`. */
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
  http.get(
    `${BASE}/safes/:safe/multisig-transactions/`,
    ({ request, params }) => {
      const url = new URL(request.url);
      let results = [...serviceState.transactions.values()].filter(
        (t) => t.safe?.toLowerCase() === String(params.safe).toLowerCase(),
      );
      const nonce = url.searchParams.get("nonce");
      if (nonce !== null) {
        results = results.filter((t) => String(t.nonce) === nonce);
      }
      if (url.searchParams.get("executed") === "false") {
        results = results.filter((t) => !t.isExecuted);
      }
      if (url.searchParams.get("ordering") === "-nonce") {
        results.sort((a, b) => Number(b.nonce) - Number(a.nonce));
      }
      const limit = url.searchParams.get("limit");
      if (limit) results = results.slice(0, Number(limit));
      return HttpResponse.json({ count: results.length, results });
    },
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
