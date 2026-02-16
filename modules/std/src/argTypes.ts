import type { CustomArgTypes } from "@evmcrispr/sdk";
import { BindingsSpace, ErrorException, fieldItem } from "@evmcrispr/sdk";

const { MODULE } = BindingsSpace;

export const types: CustomArgTypes = {
  module: {
    validate(name, value) {
      if (typeof value !== "string") {
        throw new ErrorException(`${name} must be a string, got ${value}`);
      }
    },
    completions(ctx) {
      const json = ctx.bindings.getMetadata("__available_modules__");
      if (!json) return [];

      try {
        const available = JSON.parse(json) as string[];
        return available
          .filter((name) => !ctx.bindings.hasBinding(name, MODULE))
          .map(fieldItem);
      } catch {
        return [];
      }
    },
    async resolve(rawValue, ctx) {
      const moduleData = ctx.cache.getBindingValue(rawValue, MODULE);
      if (!moduleData) return [];

      const bindings: any[] = [
        { type: MODULE, identifier: rawValue, value: moduleData },
      ];

      // Honor --as alias
      const alias = ctx.commandNode?.opts.find((o) => o.name === "as")?.value
        ?.value;
      if (alias) {
        bindings.push({
          type: MODULE,
          identifier: alias,
          value: { ...moduleData, alias },
        });
      }

      return bindings;
    },
  },
};
