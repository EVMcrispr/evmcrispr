import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException, fieldItem } from "@evmcrispr/sdk";
import { TWAP_CREATION_CHAINS } from "./twap/networks";
import { TWAP_PROVIDERS } from "./twap/registry";
import { VENUES } from "./venues/registry";

export const types: CustomArgTypes = {
  "twap-venue": {
    validate(_name, value) {
      if (typeof value !== "string" || !TWAP_PROVIDERS[value.toLowerCase()]) {
        throw new ErrorException(
          `${value} does not support TWAP orders (supported: CoWSwap)`,
        );
      }
    },
    completions(ctx) {
      return Object.values(TWAP_PROVIDERS)
        .filter(
          (p) =>
            !ctx.chainId ||
            (p.supports(ctx.chainId) && TWAP_CREATION_CHAINS.has(ctx.chainId)),
        )
        .map((p) => fieldItem(p.name));
    },
  },
  "swap-venue": {
    validate(name, value) {
      if (typeof value !== "string" || !VENUES[value.toLowerCase()]) {
        const known = Object.values(VENUES)
          .map((v) => v.name)
          .join(", ");
        throw new ErrorException(
          `${name} must be one of ${known}, got ${value}`,
        );
      }
    },
    completions(ctx) {
      const venues = Object.values(VENUES).filter(
        (v) => !ctx.chainId || v.supports(ctx.chainId),
      );
      return venues.map((v) => fieldItem(v.name));
    },
  },
};
