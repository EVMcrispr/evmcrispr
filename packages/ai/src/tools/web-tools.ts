import { type ToolSet, tool } from "ai";
import { z } from "zod";

/** Character budget for a fetched page; keeps tool results model-sized. */
export const PAGE_CHAR_BUDGET = 20_000;

export function truncate(text: string, budget = PAGE_CHAR_BUDGET): string {
  if (text.length <= budget) return text;
  const dropped = text.length - budget;
  return `${text.slice(0, budget)}\n\n[Truncated at ${budget} characters (${dropped} more not shown). Fetch a more specific URL or section if you need the rest.]`;
}

interface SearchResult {
  title?: string;
  url?: string;
  description?: string;
}

/**
 * Web tools: search and page reading via the EVMcrispr API (Tavily behind
 * the scenes — extraction handles JS-rendered pages and bot walls that a
 * plain fetch would miss).
 */
export function createWebTools(apiBase = "https://api.evmcrispr.com"): ToolSet {
  const searchWeb = tool({
    description:
      "Search the web. Returns result titles, URLs and snippets. Use it to find documentation of external protocols, contracts, or anything not covered by the EVML docs tools, then read promising results with fetch_page.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      count: z
        .number()
        .optional()
        .describe("Number of results (1-10, default 5)"),
    }),
    execute: async ({ query, count }) => {
      const params = new URLSearchParams({ q: query });
      if (count) params.set("count", String(count));

      try {
        const res = await fetch(`${apiBase}/search?${params}`);
        if (res.status === 429)
          return "ERROR: search quota or rate limit hit (HTTP 429). Do not retry immediately; continue with what you already know and say so.";
        if (!res.ok)
          return `ERROR: search failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}. Try again once, rephrase the query, or answer from what you already know and say so.`;

        const { results } = (await res.json()) as { results?: SearchResult[] };
        if (!results?.length) return `No results for "${query}".`;
        return results
          .map(
            (r, i) =>
              `${i + 1}. ${r.title ?? "(untitled)"}\n   ${r.url ?? ""}\n   ${r.description ?? ""}`,
          )
          .join("\n");
      } catch (err) {
        return `ERROR: could not reach the search service: ${err instanceof Error ? err.message : err}. The user may be offline; tell them web search is unavailable right now.`;
      }
    },
  });

  const fetchPage = tool({
    description:
      "Fetch a web page and return its readable content as markdown (truncated if long). Use it to read documentation pages found with search_web, or any https URL the user mentions.",
    inputSchema: z.object({
      url: z.string().describe("Full https:// URL to fetch"),
    }),
    execute: async ({ url }) => {
      if (!url.startsWith("https://"))
        return "ERROR: only https:// URLs can be fetched.";

      try {
        const res = await fetch(
          `${apiBase}/extract?url=${encodeURIComponent(url)}`,
        );
        if (res.status === 429)
          return "ERROR: page-reading quota or rate limit hit (HTTP 429). Do not retry immediately; continue with what you already know and say so.";
        if (!res.ok)
          return `ERROR: fetching ${url} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}. The page may not exist or could not be read; try another URL or a web search.`;

        const { content } = (await res.json()) as { content?: string };
        if (!content)
          return `ERROR: no readable content extracted from ${url}. Try another URL.`;
        return truncate(`Source: ${url}\n\n${content}`);
      } catch (err) {
        return `ERROR: could not read the page: ${err instanceof Error ? err.message : err}. The user may be offline; tell them web access is unavailable right now.`;
      }
    },
  });

  return {
    search_web: searchWeb,
    fetch_page: fetchPage,
  };
}
