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
  return `${article} "${label}" is experimental and not enabled. Set VITE_PUBLIC_EXPERIMENTAL=true to enable it.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
