import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import {
  PROJECT_ANCHOR_BASE,
  PROJECT_ANCHOR_OPTIMISM,
  PROJECT_RECIPIENT,
  PROJECT_RECIPIENT_L2,
  TIP_RECIPIENT,
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
    ],
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
    anchorContracts: [],
  },
};

const resolveProject = async (request: Request) => {
  const body = (await request.json()) as { variables?: { slug?: string } };
  const slug = body?.variables?.slug ?? "";
  return HttpResponse.json({
    data: { projectBySlug: projects[slug] ?? null },
  });
};

// A RegExp matcher: the CORS-proxied spelling nests "https://" in the path,
// which MSW's string route parser cannot represent.
export const givethGraphqlHandlers = [
  http.post(/mainnet\.serve\.giveth\.io\/graphql/, ({ request }) =>
    resolveProject(request),
  ),
];
