import type {
  BindingsManager,
  CompletionItem,
  CustomArgTypes,
} from "@evmcrispr/sdk";
import { ErrorException, isNum, isString } from "@evmcrispr/sdk";
import { CORS_PROXY_PREFIX, GIVETH_GRAPHQL_URL } from "./addresses";

/** How many top-ranked projects to offer as completions (of thousands).
 *  impact-graph rejects allProjects limits above 50 with an
 *  "Argument Validation Error". */
const PROJECT_LIMIT = 50;

const TOP_PROJECTS_QUERY = `
query GetTopProjects($limit: Int!) {
  allProjects(limit: $limit, sortingBy: InstantBoosting) {
    projects {
      title
      slug
    }
  }
}
`;

/** Top-project completions, one fetch per workspace (keyed by its cache). */
const projectItems = new WeakMap<BindingsManager, Promise<CompletionItem[]>>();

async function fetchTopProjects(): Promise<CompletionItem[]> {
  const res = await fetch(CORS_PROXY_PREFIX + GIVETH_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: TOP_PROJECTS_QUERY,
      variables: { limit: PROJECT_LIMIT },
    }),
  }).then((r) => r.json() as Promise<any>);
  const projects: { title?: string; slug?: string }[] =
    res?.data?.allProjects?.projects ?? [];
  return projects
    .filter((p) => typeof p.slug === "string" && p.slug)
    .map((p) => {
      // impact-graph resolves old spellings via slug history, so offer the
      // clean slug instead of the dedup-suffixed one.
      const slug = p.slug === "evmcrispr-0" ? "evmcrispr" : p.slug!;
      return {
        label: slug,
        insertText: slug,
        kind: "field" as const,
        sortPriority: 1,
        detail: p.title,
      };
    });
}

export const types: CustomArgTypes = {
  "giveth-project": {
    validate(name, value) {
      if (!isString(value) && !isNum(value)) {
        throw new ErrorException(
          `${name} must be a Giveth project slug, got ${value}`,
        );
      }
    },
    completions(ctx) {
      let items = projectItems.get(ctx.cache);
      if (!items) {
        items = fetchTopProjects();
        // Don't pin a failed fetch for the whole session — retry next time.
        items.catch(() => projectItems.delete(ctx.cache));
        projectItems.set(ctx.cache, items);
      }
      return items.catch(() => []);
    },
  },
};
