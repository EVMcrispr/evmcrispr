import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";

/** Mutable in-memory Safe Transaction Service used by the tests: proposals
 *  POSTed by `safe:propose` land in `proposals`; queued transactions for
 *  `safe:execute <hash>` are seeded into `transactions`. */
export const serviceState = {
  proposals: [] as any[],
  confirmations: [] as { safeTxHash: string; signature: string }[],
  /** Safe messages POSTed by `safe:propose`, as the service stores them:
   *  keyed by the lowercase safeMessageHash the test computes. */
  messageProposals: [] as any[],
  messageSignatures: [] as { messageHash: string; signature: string }[],
  messages: new Map<string, any>(),
  transactions: new Map<string, any>(),
  /** Delegates of the v2 delegates endpoint, as the service lists them. */
  delegates: [] as any[],
  delegateRemovals: [] as any[],
  /** Serve POSTed proposals back from the queue, as the real service
   *  does. Off by default: most tests seed the queue by hand. */
  serveProposals: false,
  reset() {
    this.serveProposals = false;
    this.delegates = [];
    this.delegateRemovals = [];
    this.proposals = [];
    this.confirmations = [];
    this.messageProposals = [];
    this.messageSignatures = [];
    this.messages.clear();
    this.transactions.clear();
  },
};

// Anvil forks gnosis (chain id 100 -> "gno")
const BASE = "https://api.safe.global/tx-service/gno/api/v1";

const BASE_V2 = "https://api.safe.global/tx-service/gno/api/v2";

export const safeServiceHandlers = [
  http.get(`${BASE_V2}/delegates/`, ({ request }) => {
    const url = new URL(request.url);
    const results = serviceState.delegates.filter((d) =>
      ["safe", "delegate", "delegator"].every((key) => {
        const want = url.searchParams.get(key);
        return !want || String(d[key]).toLowerCase() === want.toLowerCase();
      }),
    );
    return HttpResponse.json({ count: results.length, results });
  }),
  http.post(`${BASE_V2}/delegates/`, async ({ request }) => {
    const body: any = await request.json();
    serviceState.delegates.push(body);
    return HttpResponse.json(body, { status: 201 });
  }),
  http.delete(
    `${BASE_V2}/delegates/:delegate/`,
    async ({ request, params }) => {
      const body: any = await request.json();
      serviceState.delegateRemovals.push({
        ...body,
        delegate: params.delegate,
      });
      serviceState.delegates = serviceState.delegates.filter(
        (d) =>
          !(
            String(d.delegate).toLowerCase() ===
              String(params.delegate).toLowerCase() &&
            String(d.delegator).toLowerCase() ===
              body.delegator.toLowerCase() &&
            (d.safe ?? null) === (body.safe ?? null)
          ),
      );
      return new HttpResponse(null, { status: 204 });
    },
  ),
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
      // Like the real service, only unsigned pushes are untrusted.
      if (url.searchParams.get("trusted") === "true") {
        results = results.filter((t) => t.trusted !== false);
      }
      if (url.searchParams.get("executed") === "false") {
        results = results.filter((t) => !t.isExecuted);
      }
      const gte = url.searchParams.get("nonce__gte");
      if (gte !== null) {
        results = results.filter((t) => BigInt(t.nonce) >= BigInt(gte));
      }
      const ordering = url.searchParams.get("ordering");
      if (ordering === "-nonce") {
        results.sort((a, b) => Number(b.nonce) - Number(a.nonce));
      } else if (ordering === "nonce") {
        results.sort((a, b) => Number(a.nonce) - Number(b.nonce));
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = url.searchParams.get("limit");
      results = results.slice(
        offset,
        limit ? offset + Number(limit) : undefined,
      );
      return HttpResponse.json({ count: results.length, results });
    },
  ),
  http.post(
    `${BASE}/safes/:safe/multisig-transactions/`,
    async ({ request, params }) => {
      const body = (await request.json()) as any;
      serviceState.proposals.push(body);
      // Served back like the real service does, so proposals can be
      // followed (and executed by hash).
      if (serviceState.serveProposals)
        serviceState.transactions.set(
          String(body.contractTransactionHash).toLowerCase(),
          {
            ...body,
            safe: params.safe,
            safeTxHash: body.contractTransactionHash,
            trusted: !!body.signature,
            confirmationsRequired: 1,
            isExecuted: false,
            confirmations: body.signature
              ? [{ owner: body.sender, signature: body.signature }]
              : [],
          },
        );
      return new HttpResponse(null, { status: 201 });
    },
  ),
  http.post(
    `${BASE}/multisig-transactions/:hash/confirmations/`,
    async ({ request, params }) => {
      const { signature } = (await request.json()) as { signature: string };
      serviceState.confirmations.push({
        safeTxHash: String(params.hash).toLowerCase(),
        signature,
      });
      return new HttpResponse(null, { status: 201 });
    },
  ),
  http.post(`${BASE}/safes/:safe/messages/`, async ({ request, params }) => {
    serviceState.messageProposals.push({
      safe: params.safe,
      ...((await request.json()) as object),
    });
    return new HttpResponse(null, { status: 201 });
  }),
  http.post(
    `${BASE}/messages/:hash/signatures/`,
    async ({ request, params }) => {
      const { signature } = (await request.json()) as { signature: string };
      serviceState.messageSignatures.push({
        messageHash: String(params.hash).toLowerCase(),
        signature,
      });
      return new HttpResponse(null, { status: 201 });
    },
  ),
  http.get(`${BASE}/messages/:hash/`, ({ params }) => {
    const message = serviceState.messages.get(
      String(params.hash).toLowerCase(),
    );
    if (!message)
      return HttpResponse.json({ detail: "Not found." }, { status: 404 });
    return HttpResponse.json(message);
  }),
  http.get(`${BASE}/multisig-transactions/:hash/`, ({ params }) => {
    const tx = serviceState.transactions.get(String(params.hash).toLowerCase());
    if (!tx) {
      return HttpResponse.json({ detail: "Not found." }, { status: 404 });
    }
    return HttpResponse.json(tx);
  }),
];
