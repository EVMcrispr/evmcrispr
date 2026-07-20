import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import {
  GIV_OPTIMISM,
  PROJECT_ANCHOR_BASE,
  PROJECT_ANCHOR_GNOSIS,
  PROJECT_ANCHOR_OPTIMISM,
  PROJECT_RECIPIENT,
  PROJECT_RECIPIENT_L2,
  TIP_ANCHOR_GNOSIS,
  TIP_RECIPIENT,
  USDC,
  USDCX,
} from "../fixtures";

// Mocked projectBySlug responses mirroring the live impact-graph shape
// (verified against https://mainnet.serve.giveth.io/graphql, 2026-07-20).
const projects: Record<string, unknown> = {
  evmcrispr: {
    id: "1350",
    slug: "evmcrispr",
    addresses: [
      ...[1, 10, 100, 137].map((networkId) => ({
        address: PROJECT_RECIPIENT,
        networkId,
        isRecipient: true,
        chainType: "EVM",
      })),
      ...[42161, 8453, 1101, 42220].map((networkId) => ({
        address: PROJECT_RECIPIENT_L2,
        networkId,
        isRecipient: true,
        chainType: "EVM",
      })),
    ],
    anchorContracts: [
      { address: PROJECT_ANCHOR_OPTIMISM, networkId: 10, isActive: true },
      { address: PROJECT_ANCHOR_BASE, networkId: 8453, isActive: true },
      { address: PROJECT_ANCHOR_GNOSIS, networkId: 100, isActive: true },
    ],
  },
  "wayback-machine": {
    id: "2000",
    slug: "wayback-machine",
    addresses: [
      {
        address: PROJECT_RECIPIENT,
        networkId: 100,
        isRecipient: true,
        chainType: "EVM",
      },
    ],
    anchorContracts: [],
  },
  "gnosis-only-project": {
    id: "9999",
    slug: "gnosis-only-project",
    addresses: [
      {
        address: PROJECT_RECIPIENT,
        networkId: 100,
        isRecipient: true,
        chainType: "EVM",
      },
    ],
    anchorContracts: [],
  },
  "the-giveth-community-of-makers": {
    id: "1",
    slug: "the-giveth-community-of-makers",
    addresses: [1, 10, 100, 137, 8453, 42161, 42220].map((networkId) => ({
      address: TIP_RECIPIENT,
      networkId,
      isRecipient: true,
      chainType: "EVM",
    })),
    anchorContracts: [
      { address: TIP_ANCHOR_GNOSIS, networkId: 100, isActive: true },
    ],
  },
};

/** userByAddress fixtures: lowercase address → user. Anvil mnemonic
 *  account #0 (the signing wallet in boost tests) shares the profile. */
const users: Record<string, { id: string }> = {
  [TEST_ACCOUNT_ADDRESS.toLowerCase()]: { id: "25" },
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266": { id: "25" },
};

/** getPowerBoosting fixtures: userId → powerBoostings (zero-percentage rows
 *  mirror how the live API keeps dropped boosts around). */
const boostings: Record<string, unknown[]> = {
  "25": [
    { percentage: 30, project: { id: "2000", slug: "wayback-machine" } },
    { percentage: 70, project: { id: "1350", slug: "evmcrispr" } },
    { percentage: 0, project: { id: "9999", slug: "gnosis-only-project" } },
  ],
};

export const TEST_NONCE = "AbCdEfGh12345678";
export const TEST_JWT = "test.giveth.jwt";

/** Bodies of successful /authentication POSTs, for test assertions. */
export const recordedLogins: {
  message: string;
  signature: string;
  nonce: string;
}[] = [];

/** setMultiplePowerBoosting calls received by the mocked API. */
export const recordedBoosts: {
  projectIds: number[];
  percentages: number[];
  authVersion: string | null;
}[] = [];

/** createDonation calls received by the mocked API (raw variables). */
export const recordedDonations: Record<string, any>[] = [];

/** createRecurringDonation calls received by the mocked API. */
export const recordedRecurringDonations: Record<string, any>[] = [];

/** updateRecurringDonationParams calls received by the mocked API. */
export const recordedRecurringUpdates: Record<string, any>[] = [];

/** updateRecurringDonationStatus calls received by the mocked API. */
export const recordedRecurringStatusUpdates: Record<string, any>[] = [];

const resolveGraphql = async (request: Request) => {
  const body = (await request.json()) as {
    query?: string;
    variables?: Record<string, any>;
  };
  const query = body?.query ?? "";
  const variables = body?.variables ?? {};

  if (query.includes("allProjects")) {
    return HttpResponse.json({
      data: {
        allProjects: {
          projects: Object.keys(projects)
            .slice(0, Number(variables.limit ?? Object.keys(projects).length))
            .map((slug) => ({ title: slug.replace(/-/g, " "), slug })),
        },
      },
    });
  }
  if (query.includes("projectBySlug")) {
    return HttpResponse.json({
      data: { projectBySlug: projects[variables.slug ?? ""] ?? null },
    });
  }
  if (query.includes("userByAddress")) {
    return HttpResponse.json({
      data: {
        userByAddress:
          users[String(variables.address ?? "").toLowerCase()] ?? null,
      },
    });
  }
  if (query.includes("getPowerBoosting")) {
    return HttpResponse.json({
      data: {
        getPowerBoosting: {
          powerBoostings: boostings[String(variables.userId)] ?? [],
        },
      },
    });
  }
  if (query.includes("createRecurringDonation")) {
    if (request.headers.get("authorization") !== `Bearer ${TEST_JWT}`) {
      return HttpResponse.json({ errors: [{ message: "unAuthorized" }] });
    }
    recordedRecurringDonations.push(variables);
    return HttpResponse.json({
      data: {
        createRecurringDonation: {
          id: String(recordedRecurringDonations.length),
        },
      },
    });
  }
  if (query.includes("updateRecurringDonationStatus")) {
    if (request.headers.get("authorization") !== `Bearer ${TEST_JWT}`) {
      return HttpResponse.json({ errors: [{ message: "unAuthorized" }] });
    }
    recordedRecurringStatusUpdates.push(variables);
    return HttpResponse.json({
      data: {
        updateRecurringDonationStatus: { id: String(variables.donationId) },
      },
    });
  }
  if (query.includes("updateRecurringDonationParams")) {
    if (request.headers.get("authorization") !== `Bearer ${TEST_JWT}`) {
      return HttpResponse.json({ errors: [{ message: "unAuthorized" }] });
    }
    // Like the live backend, updates only succeed for streams Giveth already
    // knows about — a create recorded since the last reset. This is what
    // exercises the update→create fallback in tests.
    const known = recordedRecurringDonations.some(
      (d) =>
        d.projectId === variables.projectId &&
        d.networkId === variables.networkId &&
        d.currency === variables.currency,
    );
    if (!known) {
      return HttpResponse.json({
        errors: [{ message: "Recurring donation not found." }],
      });
    }
    recordedRecurringUpdates.push(variables);
    return HttpResponse.json({
      data: {
        updateRecurringDonationParams: {
          id: String(recordedRecurringUpdates.length),
        },
      },
    });
  }
  if (query.includes("createDonation")) {
    if (request.headers.get("authorization") !== `Bearer ${TEST_JWT}`) {
      return HttpResponse.json({ errors: [{ message: "unAuthorized" }] });
    }
    recordedDonations.push(variables);
    return HttpResponse.json({
      data: { createDonation: recordedDonations.length },
    });
  }
  if (query.includes("setMultiplePowerBoosting")) {
    if (request.headers.get("authorization") !== `Bearer ${TEST_JWT}`) {
      return HttpResponse.json({
        errors: [{ message: "Authentication required." }],
      });
    }
    recordedBoosts.push({
      projectIds: variables.projectIds,
      percentages: variables.percentages,
      authVersion: request.headers.get("authversion"),
    });
    return HttpResponse.json({
      data: {
        setMultiplePowerBoosting: variables.projectIds.map(
          (_: number, i: number) => ({ id: String(i + 1) }),
        ),
      },
    });
  }
  return HttpResponse.json({ errors: [{ message: "Unmocked query" }] });
};

// Minimal Superfluid extended tokenlist: the underlying→SuperToken lookup
// donate-recurring performs for non-SuperToken inputs (Gnosis USDC→USDCx),
// plus the Optimism GIVx entry the anchor helper's superfluid docCase
// resolves by symbol (this mock replaces the real list for every test).
const superfluidTokenlist = {
  tokens: [
    {
      symbol: "USDCx",
      name: "Super USDC",
      chainId: 100,
      address: USDCX,
      extensions: {
        superTokenInfo: { type: "Wrapper", underlyingTokenAddress: USDC },
      },
    },
    {
      symbol: "GIVx",
      name: "Super GIV",
      chainId: 10,
      address: "0x4cab5b9930210e2edc6a905b9c75d615872a1a7e",
      extensions: {
        superTokenInfo: {
          type: "Wrapper",
          underlyingTokenAddress: GIV_OPTIMISM,
        },
      },
    },
  ],
};

// RegExp matchers throughout: the CORS-proxied spelling nests "https://" in
// the path, which MSW's string route parser cannot represent.
export const givethGraphqlHandlers = [
  http.get(/tokenlist\.superfluid\.org/, () =>
    HttpResponse.json(superfluidTokenlist),
  ),
  http.post(/mainnet\.serve\.giveth\.io\/graphql/, ({ request }) =>
    resolveGraphql(request),
  ),
  http.get(/auth\.giveth\.io\/v1\/nonce/, () =>
    HttpResponse.json({ message: TEST_NONCE }),
  ),
  http.post(/auth\.giveth\.io\/v1\/authentication/, async ({ request }) => {
    const body = (await request.json()) as {
      message?: string;
      signature?: string;
      nonce?: string;
    };
    if (!body?.message || !body?.signature || body?.nonce !== TEST_NONCE) {
      return HttpResponse.json(
        { message: "Invalid signature or nonce" },
        { status: 400 },
      );
    }
    recordedLogins.push(body as (typeof recordedLogins)[number]);
    return HttpResponse.json({
      jwt: TEST_JWT,
      expiration: 1999999999999,
      publicAddress: TEST_ACCOUNT_ADDRESS.toLowerCase(),
    });
  }),
];
