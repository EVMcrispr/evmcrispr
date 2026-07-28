import { type ToolSet, tool } from "ai";
import { z } from "zod";

import { EVMCRISPR_API_BASE } from "../config/api";
import { htmlToMarkdown } from "./html-to-markdown";

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
 * Web tools: search via the EVMcrispr API (Tavily behind the scenes) and
 * page reading via its GET-only fetch proxy, converted to markdown locally.
 */
export function createWebTools(): ToolSet {
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

      let res: Response;
      try {
        res = await fetch(`${EVMCRISPR_API_BASE}/search?${params}`);
      } catch (err) {
        return `ERROR: could not reach the search service: ${err instanceof Error ? err.message : err}. The user may be offline; tell them web search is unavailable right now.`;
      }
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

      let res: Response;
      try {
        res = await fetch(`${EVMCRISPR_API_BASE}/fetch/${url}`);
      } catch (err) {
        return `ERROR: could not reach the fetch service: ${err instanceof Error ? err.message : err}. The user may be offline; tell them web access is unavailable right now.`;
      }
      if (!res.ok)
        return `ERROR: fetching ${url} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}. The page may not exist; try another URL or a web search.`;

      const contentType = res.headers.get("content-type") ?? "";
      const body = await res.text();
      if (contentType.includes("text/html"))
        return truncate(await htmlToMarkdown(body, url));
      if (contentType.includes("text/") || contentType.includes("json"))
        return truncate(body);
      return `ERROR: unsupported content type "${contentType}" — only HTML and text pages can be read. Try a documentation page instead.`;
    },
  });

  return {
    search_web: searchWeb,
    fetch_page: fetchPage,
  };
}
