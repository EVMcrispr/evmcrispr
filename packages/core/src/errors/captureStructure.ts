import type {
  CommandExpressionNode,
  ErrorCaptureNode,
  Node,
} from "@evmcrispr/sdk";
import { NodeType } from "@evmcrispr/sdk";

/**
 * Structural capture rules a command line must satisfy before it is
 * evaluated, shared by the analyzer (as diagnostics) and the interpreter
 * (as a refusal to run the line). Purely syntactic apart from the facts
 * the caller supplies: whether the command runs a block inline, where the
 * line is being evaluated, and whether it is known to send nothing.
 */

/** Where a line is being evaluated, which decides what a revert capture
 *  could possibly observe. */
export type CaptureContext =
  /** Top level (or a `def` body run at top level): the line sends its own
   *  transactions, so both timings can be observed. */
  | "execution"
  /** Inside a collecting block (`batch`, `safe:execute`, a proposal …):
   *  the line only contributes actions to the outer transaction. */
  | "collecting"
  /** Inside a smart batch (`batch !(...)`): the whole plan is one on-chain
   *  transaction, so a revert aborts it before any line can observe it. */
  | "smart";

export interface CaptureIssueContext {
  /** The line runs a block inline (see `runsBlockInline`) or names a
   *  local `def` command. */
  blockCommand: boolean;
  context: CaptureContext;
  /** The line is known ahead of time to send no transaction. The
   *  analyzer knows this for a few std commands; the interpreter judges
   *  it at runtime instead and leaves this unset. */
  sendsNothing?: boolean;
}

export type CaptureIssueCode =
  | "capture-on-block-command"
  | "tx-capture-with-error-capture"
  | "duplicate-tx-capture"
  | "mixed-required-capture-timing"
  | "revert-capture-in-block"
  | "revert-capture-in-smart-batch"
  | "revert-capture-without-transaction";

export interface CaptureIssue {
  /** The node the issue points at (a capture when there is one). */
  readonly node: Node;
  readonly message: string;
  /** Stable diagnostic code. */
  readonly code: CaptureIssueCode;
}

/**
 * A smart batch compiles its lines into one on-chain plan: a revert aborts
 * the whole batch, so no inner line is left to observe it. Requiring one
 * is an assertion instead, and catching one is a branch.
 */
export const SMART_BATCH_REQUIRED_REVERT_CAPTURE =
  "revert captures cannot observe a revert inside a smart batch; assert it instead: assert @reverts!(<target>::!{<signature>} -!> Name())";

export const SMART_BATCH_OPTIONAL_REVERT_CAPTURE =
  "revert captures cannot catch a revert inside a smart batch; branch on it instead: if @reverts!(<target>::!{<signature>} -!> Name()) ( … )";

/** A collecting block's lines contribute calldata to the block command's
 *  own transaction; only that command can observe its revert. */
export const REVERT_CAPTURE_IN_BLOCK =
  "revert captures inside a block cannot observe the outer transaction; capture it on the block command instead";

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
 * A line's error captures split by the timing of the failure they
 * observe — refusals (`-/>`, `-?/>`) before anything is sent, reverts
 * (`-!>`, `-?!>`) on chain. Source order is kept within each family.
 */
export function splitByTiming(captures: readonly ErrorCaptureNode[]): {
  refusal: ErrorCaptureNode[];
  revert: ErrorCaptureNode[];
} {
  const refusal: ErrorCaptureNode[] = [];
  const revert: ErrorCaptureNode[] = [];
  for (const capture of captures)
    (capture.timing === "refusal" ? refusal : revert).push(capture);
  return { refusal, revert };
}

/**
 * The structural problems with a line's captures, in the order they are
 * reported.
 */
export function captureStructureIssues(
  c: CommandExpressionNode,
  { blockCommand, context, sendsNothing }: CaptureIssueContext,
): CaptureIssue[] {
  const errorCaps = c.errorCaptures ?? [];
  const txCaps = c.txCaptures ?? [];
  const issues: CaptureIssue[] = [];

  if (blockCommand && errorCaps.length > 0) {
    issues.push({
      node: errorCaps[0],
      code: "capture-on-block-command",
      message: `Error captures (-/>, -?/>, -!>, -?!>) are not supported on block commands (if/loop/def): "${c.name}" runs its transactions inside the block; capture on the inner commands instead.`,
    });
  }

  if (txCaps.length > 0 && errorCaps.length > 0) {
    issues.push({
      node: txCaps[0],
      code: "tx-capture-with-error-capture",
      message:
        "Tx captures ($>, $*>) cannot be combined with error captures (-/>, -?/>, -!>, -?!>) — a line that fails has no meaningful hash to capture.",
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

  const { refusal, revert } = splitByTiming(errorCaps);

  // The two families answer different questions, so a line may carry
  // both — but only one of them may be the one that must happen.
  const requiredRefusal = refusal.find((cap) => !cap.optional);
  if (requiredRefusal && revert.some((cap) => !cap.optional)) {
    issues.push({
      node: requiredRefusal,
      code: "mixed-required-capture-timing",
      message:
        "a line cannot both refuse before sending (-/>) and revert after (-!>); keep one required timing",
    });
  }

  // A revert capture is only meaningful where the line sends its own
  // transaction. Each offending clause is reported where it is written.
  for (const capture of revert) {
    if (context === "smart") {
      issues.push({
        node: capture,
        code: "revert-capture-in-smart-batch",
        message: capture.optional
          ? SMART_BATCH_OPTIONAL_REVERT_CAPTURE
          : SMART_BATCH_REQUIRED_REVERT_CAPTURE,
      });
    } else if (context === "collecting") {
      issues.push({
        node: capture,
        code: "revert-capture-in-block",
        message: REVERT_CAPTURE_IN_BLOCK,
      });
    } else if (sendsNothing) {
      issues.push({
        node: capture,
        code: "revert-capture-without-transaction",
        message: `"${c.name}" sends no transaction, so a revert capture can never match; a refusal capture (-/>, -?/>) observes what it does before sending`,
      });
    }
  }

  return issues;
}
