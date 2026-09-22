import type { CommandExpressionNode, Node } from "@evmcrispr/sdk";
import { NodeType } from "@evmcrispr/sdk";

/**
 * Structural capture rules a command line must satisfy before it is
 * evaluated, shared by the analyzer (as diagnostics) and the interpreter
 * (as a refusal to run the line). Purely syntactic apart from one fact
 * the caller supplies: whether the command runs a block inline.
 */

export interface CaptureIssue {
  /** The node the issue points at (a capture when there is one). */
  readonly node: Node;
  readonly message: string;
  /** Stable diagnostic code. */
  readonly code:
    | "capture-on-block-command"
    | "tx-capture-with-error-capture"
    | "duplicate-tx-capture";
}

/**
 * Whether a std `if`/`loop` line executes a block while it is interpreted.
 * Such a line's transactions run inside the block, so an error capture on
 * it could never observe them. (Local `def` commands run their body the
 * same way; the caller knows which names are defs.)
 */
export function runsBlockInline(
  owningModule: string,
  localName: string,
  c: CommandExpressionNode,
): boolean {
  return (
    owningModule === "std" &&
    (localName === "if" || localName === "loop") &&
    c.args.some((a) => a.type === NodeType.BlockExpression)
  );
}

/**
 * The structural problems with a line's captures, in the order they are
 * reported. `blockCommand` says whether the line runs a block inline (see
 * `runsBlockInline`) or names a local `def` command.
 */
export function captureStructureIssues(
  c: CommandExpressionNode,
  { blockCommand }: { blockCommand: boolean },
): CaptureIssue[] {
  const errorCaps = c.errorCaptures ?? [];
  const txCaps = c.txCaptures ?? [];
  const issues: CaptureIssue[] = [];

  if (blockCommand && errorCaps.length > 0) {
    issues.push({
      node: errorCaps[0],
      code: "capture-on-block-command",
      message: `Error captures are not supported on block commands (if/loop/def): "${c.name}" runs its transactions inside the block; capture on the inner commands instead.`,
    });
  }

  if (txCaps.length > 0 && errorCaps.length > 0) {
    issues.push({
      node: txCaps[0],
      code: "tx-capture-with-error-capture",
      message:
        "Tx captures ($>, $*>) cannot be combined with error captures (-!>, -?!>) — a reverted transaction has no meaningful hash to capture.",
    });
  }

  for (const all of [false, true]) {
    const sameForm = txCaps.filter((t) => t.all === all);
    if (sameForm.length > 1) {
      issues.push({
        node: sameForm[1],
        code: "duplicate-tx-capture",
        message: `Duplicate "${all ? "$*>" : "$>"}" capture — each tx-capture form may appear at most once per command.`,
      });
    }
  }

  return issues;
}
