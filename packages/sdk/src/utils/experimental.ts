/**
 * Whether experimental modules/commands/helpers/options are enabled via the
 * `VITE_PUBLIC_EXPERIMENTAL` environment variable.
 *
 *  - In Vite-built browser bundles (terminal, website, worker),
 *    `import.meta.env.VITE_PUBLIC_EXPERIMENTAL` is statically replaced at
 *    build time.
 *  - In Node/Bun (CLI, MCP, tests), `process.env.VITE_PUBLIC_EXPERIMENTAL`
 *    is read at runtime.
 */
export function isExperimentalEnabled(): boolean {
  let value: string | undefined;
  try {
    value = (
      import.meta as unknown as { env?: Record<string, string | undefined> }
    ).env?.VITE_PUBLIC_EXPERIMENTAL;
  } catch {
    /* `import.meta.env` is undefined outside Vite — fall through. */
  }
  if (value === undefined && typeof process !== "undefined") {
    value = process.env?.VITE_PUBLIC_EXPERIMENTAL;
  }
  return value === "true" || value === "1";
}

export function experimentalDisabledMessage(
  kind: "module" | "command" | "helper" | "option",
  name: string,
): string {
  const label =
    kind === "helper" ? `@${name}` : kind === "option" ? `--${name}` : name;
  const article = kind === "option" ? "Option" : capitalize(kind);
  return `${article} "${label}" is experimental and not enabled. Set VITE_PUBLIC_EXPERIMENTAL=true (or pass --experimental to the CLI) to enable it.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Marker appended to experimental names in generated docs (sidebar labels,
 *  table rows); doc consumers key row filtering on it. */
export const EXPERIMENTAL_MARKER = "⚗️";

export const EXPERIMENTAL_BADGE = `${EXPERIMENTAL_MARKER} **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).`;

/**
 * Transform `:::experimental` container blocks in markdown text.
 *
 * The single text-level implementation shared by every non-website doc
 * consumer (llms-full.txt generation, the CLI docs loader); the website
 * handles the same blocks at the mdast level in its remark plugin, where
 * they render as a Starlight aside.
 *
 *  - disabled: the whole block (fences and content) is removed, and table
 *    rows carrying the ⚗️ marker (experimental options/entries in generated
 *    tables) are dropped.
 *  - enabled: the opening fence becomes the experimental badge line and the
 *    closing fence is dropped, so the content reads inline.
 *
 * Fences must sit alone on their line (`:::experimental` … `:::`). Blocks
 * cannot nest. Fences inside code fences (``` … ```) are left untouched.
 */
export function transformExperimentalMd(md: string, enabled: boolean): string {
  const out: string[] = [];
  let inCode = false;
  let inBlock = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    if (
      !enabled &&
      !inCode &&
      /^\s*\|/.test(line) &&
      line.includes(EXPERIMENTAL_MARKER)
    ) {
      continue;
    }
    if (!inCode && !inBlock && /^:::experimental\s*$/.test(line)) {
      inBlock = true;
      if (enabled) out.push(EXPERIMENTAL_BADGE);
      continue;
    }
    if (!inCode && inBlock && /^:::\s*$/.test(line)) {
      inBlock = false;
      continue;
    }
    if (inBlock && !enabled) continue;
    out.push(line);
  }
  return out.join("\n");
}
