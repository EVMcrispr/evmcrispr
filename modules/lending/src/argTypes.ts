import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException, fieldItem } from "@evmcrispr/sdk";
import { ADAPTERS } from "./adapters/registry";

export const types: CustomArgTypes = {
  "lending-adapter": {
    validate(name, value) {
      if (typeof value !== "string" || !ADAPTERS[value.toLowerCase()]) {
        const known = Object.values(ADAPTERS)
          .map((a) => a.name)
          .join(", ");
        throw new ErrorException(
          `${name} must be one of ${known}, got ${value}`,
        );
      }
    },
    completions(ctx) {
      const adapters = Object.values(ADAPTERS).filter(
        (a) => !ctx.chainId || a.supports(ctx.chainId),
      );
      return adapters.map((a) => fieldItem(a.name));
    },
  },
};
