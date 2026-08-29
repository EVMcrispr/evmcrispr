/**
 * Line ranges of `<<<SENTINEL … SENTINEL` heredoc blocks, used by both
 * script surfaces (Monaco decorations, Shiki `.line` classes) to paint a
 * colored bar + tint behind embedded code.
 *
 * Scans text rather than the AST on purpose: while typing, the script
 * often doesn't parse, and the bar would flicker off. The rules mirror
 * `core/parsers/primaries/literals/heredoc.ts` and the Monarch tokenizer
 * in `editor/evml.ts`: an uppercase sentinel after `<<<` opens the block
 * on that line; the block closes on the first later line that *starts*
 * with the sentinel (word-bounded, so `SOLIDITY` doesn't close `SOL`,
 * while `SOL)` does). An unterminated block runs to the end of the text.
 */
export type HeredocRange = {
  /** 1-based, inclusive; includes the opening fence line. */
  startLine: number;
  /** 1-based, inclusive; includes the closing fence line. */
  endLine: number;
  sentinel: string;
  /** 1-based column of `<<<` on the opening line. */
  openCol: number;
};

const OPEN_RE = /^(?!\s*#).*?<<<([A-Z][A-Z0-9]*)/;

export function findHeredocRanges(script: string): HeredocRange[] {
  const lines = script.split("\n");
  const ranges: HeredocRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN_RE.exec(lines[i]);
    if (!open) continue;
    const sentinel = open[1];
    const close = new RegExp(`^${sentinel}(?![A-Za-z0-9_])`);
    let end = lines.length - 1;
    for (let j = i + 1; j < lines.length; j++) {
      if (close.test(lines[j])) {
        end = j;
        break;
      }
    }
    ranges.push({
      startLine: i + 1,
      endLine: end + 1,
      sentinel,
      openCol: open[0].length - sentinel.length - 2,
    });
    i = end;
  }
  return ranges;
}

/** Sentinels with a dedicated color in `styles/components.css`. */
const KNOWN_KINDS = new Set(["sol", "json", "circom", "noir"]);

export function heredocKindClass(sentinel: string): string {
  const kind = sentinel.toLowerCase();
  return `heredoc-${KNOWN_KINDS.has(kind) ? kind : "other"}`;
}
