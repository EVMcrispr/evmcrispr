import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException, fieldItem } from "@evmcrispr/sdk";
import { VENUES } from "./venues/registry";

export const types: CustomArgTypes = {
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
