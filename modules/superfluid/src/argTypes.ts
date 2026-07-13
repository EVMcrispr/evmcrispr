import type { CompletionItem, CustomArgTypes } from "@evmcrispr/sdk";
import { BindingsSpace, ErrorException } from "@evmcrispr/sdk";
import { SUPERFLUID_TOKENLIST_URL } from "./addresses";
import type { SuperTokenEntry } from "./utils/supertoken";
import { ENV_TOKENLIST } from "./utils/supertoken";

const { USER, CACHE } = BindingsSpace;

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}..${addr.slice(-4)}`;
}

const SAFE_SYMBOL_RE = /^[a-zA-Z0-9.-]+$/;
const UNSAFE_CHAR_RE = /[\\'"]/;

export const types: CustomArgTypes = {
  supertoken: {
    validate(name, value) {
      if (typeof value !== "string") {
        throw new ErrorException(`${name} must be a string, got ${value}`);
      }
    },
    async completions(ctx) {
      if (!ctx.chainId) return [];

      const cacheKey = `superfluid:tokenlist:symbols:${ctx.chainId}`;
      const cached = ctx.cache.getBindingValue(cacheKey, CACHE);
      if (cached) {
        try {
          return JSON.parse(cached as string) as CompletionItem[];
        } catch {
          /* corrupted cache, re-fetch */
        }
      }

      const url = String(
        ctx.bindings.getBindingValue(ENV_TOKENLIST, USER) ??
          SUPERFLUID_TOKENLIST_URL,
      );
      if (!url.startsWith("https://")) return [];

      try {
        const { tokens }: { tokens: SuperTokenEntry[] } = await fetch(url).then(
          (r) => r.json(),
        );

        const filtered = tokens.filter(
          (t) =>
            t.chainId === ctx.chainId &&
            t.extensions?.superTokenInfo !== undefined,
        );

        const symbolCount = new Map<string, number>();
        for (const t of filtered) {
          symbolCount.set(t.symbol, (symbolCount.get(t.symbol) ?? 0) + 1);
        }

        const items: CompletionItem[] = [];
        for (const t of filtered) {
          if (UNSAFE_CHAR_RE.test(t.symbol)) continue;

          const needsDisambiguation = (symbolCount.get(t.symbol) ?? 0) > 1;
          const needsQuoting = !SAFE_SYMBOL_RE.test(t.symbol);

          let insertText: string;
          if (needsDisambiguation) {
            const raw = `${t.symbol}:${t.address}`;
            insertText = needsQuoting ? `"${raw}"` : raw;
          } else {
            insertText = needsQuoting ? `"${t.symbol}"` : t.symbol;
          }

          items.push({
            label: t.symbol,
            insertText,
            kind: "field",
            sortPriority: 1,
            detail: `${t.name} · ${truncateAddress(t.address)}`,
          });
        }

        ctx.cache.setBinding(
          cacheKey,
          JSON.stringify(items),
          CACHE,
          false,
          undefined,
          true,
        );
        return items;
      } catch {
        return [];
      }
    },
  },
};
