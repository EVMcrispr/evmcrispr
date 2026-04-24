import type { CompletionItem } from "@evmcrispr/sdk";

/**
 * Navigate into a parsed JSON value following dot-separated segments,
 * supporting `[N]` for indices and `[*]` for wildcard (samples first element).
 * Returns undefined when navigation fails.
 */
function navigateJson(obj: unknown, segments: string[]): unknown {
  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== "object") return undefined;

    const bracketMatch = seg.match(/^([^[]*)\[(\d+|\*)\]$/);
    if (bracketMatch) {
      const [, key, idx] = bracketMatch;
      if (key) {
        current = (current as Record<string, unknown>)[key];
      }
      if (!Array.isArray(current)) return undefined;
      current = idx === "*" ? current[0] : current[Number(idx)];
    } else {
      current = (current as Record<string, unknown>)[seg];
    }
  }
  return current;
}

/**
 * Build completion items for array indices.
 * `labelPrefix` is the full path for the label (e.g. `$.tokens`).
 * `insertBase` is what Monaco's word replacement needs.
 * `bracketOpen` controls whether `[` is included in insertText:
 *   - `true` (default): full bracket `[idx]` (for complete-path case, e.g. `$.tokens`)
 *   - `false`: only `idx]` (for unclosed-bracket case where `[` is already typed)
 */
function arrayIndexItems(
  arr: unknown[],
  labelPrefix: string,
  insertBase: string,
  bracketOpen = true,
): CompletionItem[] {
  const o = bracketOpen ? "[" : "";
  if (arr.length === 0) {
    return [
      {
        label: `${labelPrefix}[*]`,
        insertText: `${insertBase}${o}*]`,
        kind: "field",
        sortPriority: 0,
      },
    ];
  }
  const items: CompletionItem[] = [
    {
      label: `${labelPrefix}[0]`,
      insertText: `${insertBase}${o}0]`,
      kind: "field",
      sortPriority: 0,
    },
  ];
  if (arr.length > 1) {
    const last = arr.length - 1;
    items.push({
      label: `${labelPrefix}[${last}]`,
      insertText: `${insertBase}${o}${last}]`,
      kind: "field",
      sortPriority: 1,
    });
  }
  items.push({
    label: `${labelPrefix}[*]`,
    insertText: `${insertBase}${o}*]`,
    kind: "field",
    sortPriority: 2,
  });
  return items;
}

/**
 * Build completion items for object keys (no type-aware suffix).
 * `labelPrefix` is prepended to labels (e.g. `$.` or `$.tokens[*].`).
 * `insertBase` is prepended to insertText — only the part that falls within
 * the current Monaco word (e.g. `$.` when word is `$.`, or `.` after `]`).
 */
function objectKeyItems(
  obj: Record<string, unknown>,
  prefix: string,
  labelPrefix: string,
  insertBase: string,
): CompletionItem[] {
  return Object.keys(obj)
    .filter((k) => !prefix || k.startsWith(prefix))
    .map((k, i) => {
      const val = obj[k];
      const isArray = Array.isArray(val);
      const isObject = !isArray && typeof val === "object" && val !== null;
      const detail = isArray
        ? `array[${val.length}]`
        : isObject
          ? "object"
          : typeof val;
      return {
        label: labelPrefix + k,
        insertText: insertBase + k,
        kind: "field" as const,
        detail,
        sortPriority: i,
      };
    });
}

// Characters that break Monaco words (from the evml wordPattern exclusion set)
// relevant inside JSONPath strings.
const WORD_BREAK_RE = /[\[\]*]/;

/**
 * Compute the Monaco-aware insert base and label prefix.
 *
 * Monaco replaces the current "word" with insertText. Word boundaries inside
 * a string are determined by characters like `[`, `]`, `*` (which are excluded
 * from the evml wordPattern). So the insertText must only contain text from the
 * current word start onwards, while the label shows the full `$.`-prefixed path.
 *
 * `fullPrefix` is the full path prefix (e.g. `$.tokens[*].`).
 * Returns `insertBase` — the portion of fullPrefix within the current word.
 */
function monacoInsertBase(fullPrefix: string): string {
  let lastBreak = -1;
  for (let i = fullPrefix.length - 1; i >= 0; i--) {
    if (WORD_BREAK_RE.test(fullPrefix[i])) {
      lastBreak = i;
      break;
    }
  }
  return lastBreak === -1 ? fullPrefix : fullPrefix.slice(lastBreak + 1);
}

/** Split a JSONPath string into segments, preserving bracket expressions. */
function splitJsonPath(path: string): string[] {
  const segments: string[] = [];
  let current = "";
  let i = 0;
  while (i < path.length) {
    if (path[i] === ".") {
      if (current) segments.push(current);
      current = "";
      i++;
    } else if (path[i] === "[") {
      if (current) {
        const close = path.indexOf("]", i);
        if (close === -1) break;
        current += path.slice(i, close + 1);
        i = close + 1;
      } else {
        const close = path.indexOf("]", i);
        if (close === -1) break;
        segments.push(path.slice(i, close + 1));
        i = close + 1;
      }
    } else {
      current += path[i];
      i++;
    }
  }
  if (current) segments.push(current);
  return segments;
}

/**
 * Produce completions for a JSONPath expression. `rawPath` is the full string
 * value typed so far (e.g. `$.tokens[*].`). Labels show the full `$.`-prefixed
 * path; insertText contains only what replaces the current Monaco word.
 */
export function jsonPathCompletions(
  parsed: unknown,
  rawPath: string,
): CompletionItem[] {
  const jsonPath = rawPath.startsWith("$.")
    ? rawPath.slice(2)
    : rawPath.startsWith("$")
      ? rawPath.slice(1)
      : rawPath;

  let navigated: unknown;
  let prefix = "";
  let labelPrefix: string;
  let insertBase: string;

  // Trailing unclosed bracket: navigate to the value before `[` and suggest
  // array indices (e.g. `$.tokens[` → navigate to `tokens`, suggest indices).
  const unclosedBracket = jsonPath.match(/^(.*)\[([^\]]*)$/);
  if (unclosedBracket) {
    const pathBefore = unclosedBracket[1];
    const segments = pathBefore ? splitJsonPath(pathBefore) : [];
    try {
      navigated = navigateJson(parsed, segments);
    } catch {
      return [
        {
          label: "Error: only a subset of JSONPath is supported",
          insertText: "",
          kind: "field",
        },
      ];
    }
    const pathUpToBracket = rawPath.slice(0, rawPath.lastIndexOf("["));
    labelPrefix = pathUpToBracket.startsWith("$.")
      ? pathUpToBracket
      : `$.${pathBefore}`;
    // After `[`, Monaco word is empty → insertBase is empty, bracket already typed
    insertBase = "";
    if (Array.isArray(navigated))
      return arrayIndexItems(navigated, labelPrefix, insertBase, false);
    return [];
  }

  if (jsonPath === "" || jsonPath === ".") {
    navigated = parsed;
    labelPrefix = "$.";
    insertBase = monacoInsertBase(rawPath.length > 0 ? rawPath : "$.");
    if (!rawPath || rawPath === "$" || rawPath === "$.") insertBase = "$.";
  } else {
    const trailingDot = jsonPath.endsWith(".");
    const pathToParse = trailingDot ? jsonPath.slice(0, -1) : jsonPath;
    const segments = splitJsonPath(pathToParse);

    if (trailingDot) {
      labelPrefix = rawPath.startsWith("$.") ? rawPath : `$.${jsonPath}`;
      insertBase = monacoInsertBase(labelPrefix);
      try {
        navigated = navigateJson(parsed, segments);
      } catch {
        return [
          {
            label: "Error: only a subset of JSONPath is supported",
            insertText: "",
            kind: "field",
          },
        ];
      }
    } else {
      let fullResolved: unknown;
      try {
        fullResolved = navigateJson(parsed, segments);
      } catch {
        fullResolved = undefined;
      }

      const fullPath = rawPath.startsWith("$.") ? rawPath : `$.${jsonPath}`;

      if (fullResolved !== undefined && Array.isArray(fullResolved)) {
        labelPrefix = fullPath;
        insertBase = monacoInsertBase(fullPath);
        return arrayIndexItems(fullResolved, labelPrefix, insertBase);
      }

      if (
        fullResolved !== undefined &&
        typeof fullResolved === "object" &&
        fullResolved !== null
      ) {
        labelPrefix = fullPath + ".";
        insertBase = monacoInsertBase(fullPath + ".");
        return objectKeyItems(
          fullResolved as Record<string, unknown>,
          "",
          labelPrefix,
          insertBase,
        );
      }

      prefix = segments.pop() ?? "";
      const fullBase = rawPath.startsWith("$.")
        ? rawPath.slice(0, rawPath.length - prefix.length)
        : `$.${jsonPath.slice(0, jsonPath.length - prefix.length)}`;
      labelPrefix = fullBase;
      insertBase = monacoInsertBase(fullBase);
      try {
        navigated =
          segments.length > 0 ? navigateJson(parsed, segments) : parsed;
      } catch {
        return [
          {
            label: "Error: only a subset of JSONPath is supported",
            insertText: "",
            kind: "field",
          },
        ];
      }
    }
  }

  if (navigated == null) return [];
  if (Array.isArray(navigated))
    return arrayIndexItems(navigated, labelPrefix, insertBase);
  if (typeof navigated === "object" && navigated !== null) {
    return objectKeyItems(
      navigated as Record<string, unknown>,
      prefix,
      labelPrefix,
      insertBase,
    );
  }
  return [];
}
