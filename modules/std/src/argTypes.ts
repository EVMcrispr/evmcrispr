import type { CompletionItem, CustomArgTypes } from "@evmcrispr/sdk";
import { BindingsSpace, ErrorException } from "@evmcrispr/sdk";
import * as viemChains from "viem/chains";
import type { Chain } from "viem";

const { MODULE, USER, CACHE } = BindingsSpace;

const ENV_TOKENLIST = "$token.tokenlist";

type TokenEntry = { symbol: string; name: string; chainId: number; address: string };

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}..${addr.slice(-4)}`;
}

const SAFE_SYMBOL_RE = /^[a-zA-Z0-9.\-]+$/;
const UNSAFE_CHAR_RE = /[\\'"]/;

export const types: CustomArgTypes = {
  "token-symbol": {
    validate(name, value) {
      if (typeof value !== "string") {
        throw new ErrorException(`${name} must be a string, got ${value}`);
      }
    },
    async completions(ctx) {
      if (!ctx.chainId) return [];

      const cacheKey = `tokenlist:symbols:${ctx.chainId}`;
      const cached = ctx.cache.getBindingValue(cacheKey, CACHE);
      if (cached) {
        try {
          return JSON.parse(cached as string) as CompletionItem[];
        } catch {
          /* corrupted cache, re-fetch */
        }
      }

      const tokenListUrl = String(
        ctx.bindings.getBindingValue(ENV_TOKENLIST, USER) ??
          `https://api.evmcrispr.com/tokenlist/${ctx.chainId}`,
      );
      if (!tokenListUrl.startsWith("https://")) return [];

      try {
        const { tokens }: { tokens: TokenEntry[] } = await fetch(
          tokenListUrl,
        ).then((r) => r.json());

        const filtered = tokens.filter((t) => t.chainId === ctx.chainId);

        const symbolCount = new Map<string, number>();
        for (const t of filtered) {
          symbolCount.set(t.symbol, (symbolCount.get(t.symbol) ?? 0) + 1);
        }

        const chain = Object.values(viemChains).find(
          (c) => (c as Chain).id === ctx.chainId,
        ) as Chain | undefined;
        const nativeCurrency = chain?.nativeCurrency ?? {
          symbol: "ETH",
          name: "Ether",
        };
        const nativeSymbol = nativeCurrency.symbol;

        const items: CompletionItem[] = [
          {
            label: nativeSymbol,
            insertText: nativeSymbol,
            kind: "field",
            sortPriority: 0,
            detail: nativeCurrency.name,
          },
        ];

        for (const t of filtered) {
          if (UNSAFE_CHAR_RE.test(t.symbol)) continue;

          const needsDisambiguation =
            (symbolCount.get(t.symbol) ?? 0) > 1 ||
            t.symbol.toUpperCase() === nativeSymbol.toUpperCase();
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
        const available = JSON.parse(json) as {
          name: string;
          description?: string;
        }[];
        return available
          .filter(({ name }) => !ctx.bindings.hasBinding(name, MODULE))
          .map(
            ({ name, description }): CompletionItem => ({
              label: name,
              insertText: name,
              kind: "field",
              sortPriority: 1,
              documentation: description,
            }),
          );
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
