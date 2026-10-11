import type { ReferenceEntry } from "./reference-core";

/** Website/docs site this build links to — same PUBLIC_SITE_URL the
 *  website build uses; the experimental deploy overrides it with
 *  next-docs. */
export const SITE_URL: string =
  import.meta.env.PUBLIC_SITE_URL ?? "https://evmcrispr.com";

/** Where the docs start on the website. */
export const DOCS_URL = `${SITE_URL}/intro/getting-started/`;

/** The page of a command or a helper on the website. The site names a
 *  page after its file, lowercased and without punctuation
 *  (`abi.decode` is `abidecode`). */
export function docsPage(
  entry: Pick<ReferenceEntry, "module" | "kind" | "name">,
): string {
  const slug = entry.name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `${SITE_URL}/reference/${entry.module}/${entry.kind}s/${slug}/`;
}
