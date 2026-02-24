import type { CustomArgTypes } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import { jsonPathCompletions } from "./utils";

export const types: CustomArgTypes = {
  "json-path": {
    validate(name, value) {
      if (typeof value !== "string") {
        throw new ErrorException(`${name} must be a string, got ${value}`);
      }
    },
    async completions(ctx) {
      const dataNode = ctx.nodeArgs[ctx.argIndex - 1];
      if (!dataNode || !ctx.resolveNode) return [];

      let jsonStr: string;
      try {
        const resolved = await ctx.resolveNode(dataNode);
        if (resolved == null || typeof resolved !== "string") return [];
        jsonStr = resolved;
      } catch {
        return [];
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        return [];
      }

      const pathNode = ctx.nodeArgs[ctx.argIndex];
      const fullValue: string = pathNode?.value != null ? String(pathNode.value) : "";

      // Truncate at cursor position so mid-string edits work correctly.
      // pathNode.loc.start.col is the opening quote; content starts at +1.
      let rawPath = fullValue;
      if (pathNode?.loc && ctx.position) {
        const contentStart = pathNode.loc.start.col + 1;
        const cursorOffset = ctx.position.col - contentStart;
        if (cursorOffset >= 0 && cursorOffset < fullValue.length) {
          rawPath = fullValue.slice(0, cursorOffset);
        }
      }

      return jsonPathCompletions(parsed, rawPath);
    },
  },
};
