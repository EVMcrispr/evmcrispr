import type { FailFn } from "@evmcrispr/sdk";
import { defineErrors } from "@evmcrispr/sdk";

/**
 * The refusals `swaps:twap` documents: an order it will not create for a
 * reason that belongs to the request itself, so a loop over many tokens can
 * skip that token by name and keep going. Everything else — bad options, an
 * unreachable RPC, a failing quote service, an unverified quote — stays an
 * ordinary failure that stops the script.
 */
export const TWAP_ERRORS = defineErrors({
  SameToken: {
    description: "The sell and buy token are the same",
  },
  NoBalance: {
    description: "The funder holds none of the sell token",
  },
  Unfunded: {
    description:
      "The sell amount is below the requested number of parts, so a part would sell nothing",
    fields: [
      {
        name: "parts",
        type: "number",
        description: "Parts the order asks for, and its minimum base units",
      },
    ],
  },
  BelowMinimum: {
    description: "A part is worth less than the network's minimum order value",
    fields: [
      {
        name: "minimum",
        type: "number",
        description: "Minimum value per part, in USDC base units",
      },
    ],
  },
  NoQuote: {
    description:
      "CoW declines to quote this token or order under a documented rejection code",
  },
});

/** The `fail` of `swaps:twap`, for the helpers it refuses from. */
export type TwapFail = FailFn<typeof TWAP_ERRORS>;
