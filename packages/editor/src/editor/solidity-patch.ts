import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";

/**
 * Monaco's built-in Solidity tokenizer predates modern Solidity: its
 * keyword list is missing `emit`, `view`, `memory`, `override`, units,
 * and friends, which therefore render as plain identifiers. The Shiki
 * Viewer's TextMate grammar does highlight them, so without this patch
 * the two surfaces disagree inside `<<<SOL` heredocs.
 *
 * Words deliberately NOT added (Shiki leaves them unhighlighted too):
 * receive/fallback declarations, `type`, and builtins like msg/block/tx
 * or keccak256.
 */
const MISSING_SOLIDITY_KEYWORDS = [
  // statements & control
  "emit",
  "delete",
  "assembly",
  "selfdestruct",
  "require",
  "assert",
  "revert",
  "try",
  "catch",
  "finally",
  "global",
  "from",
  "unchecked",
  "error",
  // visibility, mutability and data-location modifiers
  "internal",
  "pure",
  "view",
  "indexed",
  "storage",
  "memory",
  "virtual",
  "calldata",
  "override",
  "abstract",
  "nonpayable",
  "immutable",
  // denomination and time units
  "ether",
  "wei",
  "gwei",
  "finney",
  "szabo",
  "seconds",
  "minutes",
  "hours",
  "days",
  "weeks",
  "years",
];

type AmdRequire = (
  deps: string[],
  onLoad: (mod: {
    language: languages.IMonarchLanguage & { keywords: string[] };
  }) => void,
  onError?: (err: unknown) => void,
) => void;

/**
 * AMD id of monaco's Solidity language chunk. Since monaco 0.56 the AMD
 * build hashes its language chunks (`vs/solidity-<hash>.js`), so the id
 * can't be written down: read it out of `basic-languages/monaco.contribution.js`,
 * which the editor already loaded (a cache hit), where the `sol` entry's
 * loader names it. The pre-0.56 `./solidity/solidity` layout resolves too.
 * Undefined when the contribution isn't served or doesn't mention Solidity.
 */
export async function solidityChunkId(
  vsBase: string,
): Promise<string | undefined> {
  const base = vsBase.replace(/\/$/, "");
  let text: string;
  try {
    const res = await fetch(`${base}/basic-languages/monaco.contribution.js`);
    if (!res.ok) return undefined;
    text = await res.text();
  } catch {
    return undefined;
  }
  const entry = text.match(/id:"sol"[^}]*?\["(\.{1,2}\/[^"]+)"\]/);
  if (!entry) return undefined;
  const rel = entry[1];
  // Loader paths are relative to vs/basic-languages/.
  const segments = ["vs", "basic-languages"];
  for (const seg of rel.split("/")) {
    if (seg === ".") continue;
    if (seg === "..") segments.pop();
    else segments.push(seg);
  }
  return segments.join("/");
}

/**
 * Re-register monaco's "sol" tokenizer with the extended keyword list.
 * Must run before any `<<<SOL` heredoc is tokenized, so the built-in
 * lazy factory never gets a chance to resolve first.
 */
export function patchEmbeddedSolidity(monaco: Monaco, vsBase: string): void {
  // The AMD build exposes its loader globally; the solidity module is a
  // lazy chunk we can load eagerly and copy.
  const amdRequire = (globalThis as { require?: unknown }).require;
  if (typeof amdRequire !== "function") return;
  const req = amdRequire as AmdRequire;

  void solidityChunkId(vsBase).then((id) => {
    if (!id) return;
    req(
      [id],
      (mod) => {
        monaco.languages.setMonarchTokensProvider("sol", {
          ...mod.language,
          keywords: [...mod.language.keywords, ...MISSING_SOLIDITY_KEYWORDS],
        });
      },
      () => {
        // Chunk not served — keep the stock tokenizer.
      },
    );
  });
}
