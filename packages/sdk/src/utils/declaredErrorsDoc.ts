/**
 * Documentation support for declared errors.
 *
 * `scripts/generate-docs.ts` reads a command/helper page's args and options
 * from the definition's source text, but a declaration block may be
 * assembled with spreads of shared objects, so its `## Errors` section comes
 * from the definition itself: the generator imports the module under bun and
 * renders the normalized `errors` it carries. That import needs no network
 * and no runtime module context — a definition is a plain value.
 *
 * It lives in the sdk, next to the declaration metadata it renders, so it is
 * type-checked and unit-tested with it. It is deliberately not part of the
 * package's public barrel: the generator imports this file by path, the way
 * it imports `utils/experimental`.
 */
import type { NormalizedDeclaredErrors } from "../types/declaredErrors";
import { declaredErrorAbi } from "./declaredErrors";
import { errorSignature } from "./error-signatures";

/** Page the `## Errors` section links to for the capture syntax. */
export const CAPTURES_PAGE = "/language/captures/";

/**
 * Anchor of that page's refusal-capture section — a declared error is a
 * build-time refusal, so it is captured with `-/>` / `-?/>`, never with the
 * revert arrows.
 */
export const REFUSALS_SECTION = `${CAPTURES_PAGE}#refusal-captures`;

export type DeclaredErrorOwner = "command" | "helper";

/**
 * Load a definition module and return the normalized declarations it
 * carries (an empty block when it declares none).
 *
 * Throws with the file path when the module cannot be loaded or exports no
 * definition: a declaration is a public contract, so a silently omitted
 * Errors section would be worse than a failed generation.
 */
export async function loadDeclaredErrors(
  filePath: string,
): Promise<NormalizedDeclaredErrors | undefined> {
  let definition: unknown;
  try {
    definition = (await import(filePath)).default;
  } catch (err) {
    throw new Error(
      `Cannot load the definition at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  if (
    !definition ||
    (typeof definition !== "object" && typeof definition !== "function")
  ) {
    throw new Error(
      `Cannot read declared errors from ${filePath}: the file has no definition as its default export`,
    );
  }
  return (definition as { errors?: NormalizedDeclaredErrors }).errors;
}

/**
 * The `## Errors` section of a command or helper page: one row per declared
 * error with its ABI signature — what an explicit capture spells — and its
 * description, followed by an ordered field table for each error that
 * carries fields. Returns no lines when nothing is declared.
 */
export function renderDeclaredErrorsSection(
  errors: NormalizedDeclaredErrors | undefined,
  owner: DeclaredErrorOwner,
): string[] {
  const entries = Object.entries(errors ?? {});
  if (entries.length === 0) return [];

  const lines: string[] = ["## Errors", ""];
  lines.push(
    owner === "helper"
      ? `Failures this helper declares. It raises them while a command line evaluates its arguments, so the command line captures them with the refusal arrows \`-?/>\` or \`-/>\` — see [Refusal captures](${REFUSALS_SECTION}).`
      : `Failures this command declares. Capture them by name with the refusal arrows \`-?/>\` or \`-/>\` — see [Refusal captures](${REFUSALS_SECTION}).`,
  );
  lines.push("");
  lines.push("| Error | Description |");
  lines.push("|-------|-------------|");
  for (const [name, def] of entries) {
    const signature = errorSignature(declaredErrorAbi(name, def));
    lines.push(`| \`${signature}\` | ${escapeCell(def.description)} |`);
  }
  lines.push("");

  for (const [name, def] of entries) {
    if (def.fields.length === 0) continue;
    const signature = errorSignature(declaredErrorAbi(name, def));
    lines.push(`**\`${signature}\` fields**`);
    lines.push("");
    lines.push("| # | Field | Type | Description |");
    lines.push("|---|-------|------|-------------|");
    def.fields.forEach((field, i) => {
      lines.push(
        `| ${i + 1} | \`${field.name}\` | \`${field.type}\` | ${escapeCell(field.description ?? "")} |`,
      );
    });
    lines.push("");
  }

  return lines;
}

/** Make a description safe inside a Markdown table cell: one line, no cell
 *  break, and no raw angle brackets (the docs render as MDX). */
function escapeCell(text: string): string {
  return text
    .replace(/\s*\n\s*/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}
