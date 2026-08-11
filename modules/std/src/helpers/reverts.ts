import type {
  CallExpressionNode,
  DestructureSlot,
  Node,
  Param,
} from "@evmcrispr/sdk";
import {
  defineHelper,
  ErrorException,
  errorAbiFromSignature,
  errorSelector,
  extractRevertData,
  isChainFailure,
  NodeType,
} from "@evmcrispr/sdk";
import {
  applyValueLens,
  categoryFromAbiType,
  chainParam,
  compileChain,
  compileOperand,
  coreCall,
  encodeIsValid,
  encodeRevertData,
  lensPath,
  lensSelectData,
  lensSlots,
  notCombine,
  staticCallParam,
  walkNavPath,
} from "@evmcrispr/sdk/onchain";
import { decodeErrorResult } from "viem";
import type Std from "..";

/** A build-time constant cannot fail the way a read can, so probing one is
 *  always a mistake: `@reverts("0x…")` or `@reverts($addr)` would answer
 *  `false` for a quoted literal or a misspelled variable and hide the error
 *  it was written to catch. Both faces require something that actually
 *  reads. */
const PROBEABLE = new Set<string>([
  NodeType.CallExpression,
  NodeType.HelperFunctionExpression,
]);

const CLAUSE_HINT =
  "e.g. @reverts($token::{transferFrom(address,address,uint256)(bool) $from $to $amt} -!> InsufficientBalance(uint256,uint256) [_ $])";

/** The parsed `-!> ErrName(types) [lens]` expectation. */
interface ProbeClause {
  optional: boolean;
  errorName: string;
  errorParams?: string[];
  lens?: DestructureSlot[];
}

const barewordValue = (node: Node | undefined): string | undefined =>
  node?.type === NodeType.Bareword
    ? (node as unknown as { value: string }).value
    : undefined;

/** Split "uint256,(address,uint256)[]" on top-level commas. */
function splitParamTypes(raw: string): string[] {
  const params: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      params.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) params.push(current.trim());
  return params;
}

/** The `[_ $]` lens argument, funneled through the SDK's shared
 *  {@link lensSlots} with this helper's clause hint. */
const errorLensSlots = (value: unknown): DestructureSlot[] =>
  lensSlots(value, `selecting one error argument, ${CLAUSE_HINT}`);

/** Read the `-!> ErrName(types) [lens]` clause out of the helper's extra
 *  arguments. The arrow and signature travel as barewords — the grammar
 *  knows nothing about them, which keeps the clause a plain convention of
 *  this helper. The compile face hands raw nodes, the run face the
 *  already-evaluated strings/array; both funnel through here. */
function parseProbeClause(
  parts: (Node | string | unknown[] | undefined)[],
): ProbeClause | undefined {
  const present = parts.filter((p) => p != null);
  if (present.length === 0) return undefined;
  const [arrowPart, sigPart, lensPart] = present;

  const asString = (part: unknown): string | undefined =>
    typeof part === "string" ? part : barewordValue(part as Node);

  const arrow = asString(arrowPart);
  if (arrow !== "-!>" && arrow !== "-?!>") {
    throw new ErrorException(
      `@reverts takes a single call, optionally followed by an error expectation — ${CLAUSE_HINT}`,
    );
  }
  const sig = asString(sigPart);
  if (!sig) {
    throw new ErrorException(
      `"${arrow}" needs an error to match, e.g. -!> InsufficientBalance(uint256,uint256)`,
    );
  }
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?$/.exec(sig);
  if (!match) {
    throw new ErrorException(
      `cannot read "${sig}" as an error signature — expected ErrName(type1,type2)`,
    );
  }
  const [, errorName, paramsRaw] = match;

  const clause: ProbeClause = { optional: arrow === "-?!>", errorName };
  if (paramsRaw !== undefined) clause.errorParams = splitParamTypes(paramsRaw);
  if (lensPart != null) clause.lens = errorLensSlots(lensPart);
  return clause;
}

/** Shared shape checks for the arrow forms: only a direct `::` call has a
 *  revert reason of its own to match, and a return lens on a call that
 *  must revert selects nothing. */
function checkProbedCall(node: Node, clause: ProbeClause): CallExpressionNode {
  if (clause.optional) {
    throw new ErrorException(
      '"-?!>" has no probe form — an expectation either matches or the probe fails. To fall back to a value when a read reverts, use @orElse',
    );
  }
  if (node.type !== NodeType.CallExpression) {
    throw new ErrorException(
      "-!> needs a direct `::` call to probe — only a live call has a revert reason to match",
    );
  }
  const call = node as CallExpressionNode;
  if (call.returnDestructure) {
    throw new ErrorException(
      "a return lens on a probed call selects nothing — the call must revert. Select an error argument instead: -!> ErrName(types) [_ $]",
    );
  }
  return call;
}

/** Select the decoded error argument the lens points at, after validating
 *  the path against the error's declared types — the same validation the
 *  compile face runs, so the two faces reject identically. */
function selectDecodedArg(
  clause: ProbeClause,
  abi: ReturnType<typeof errorAbiFromSignature>,
  decoded: unknown,
): unknown {
  walkNavPath(abi.inputs, lensPath(clause.lens!), `${clause.errorName} error`);
  return applyValueLens(decoded, clause.lens!);
}

export default defineHelper<Std>({
  name: "reverts",
  description:
    "Whether a live call reverts: true when the chain refuses the call, false when it resolves; `-!>` matches the reason and a lens selects an error argument.",
  compileDescription:
    "Bare probes negate the core's `isValid`; error expectations compile to `revertData`, which re-runs the call in-frame — so they need a direct single-hop call.",
  // "any" because the lens form returns the selected error argument, whose
  // type is the error's business; the bare and arrow forms return a bool.
  returnType: "any",
  args: [
    {
      name: "call",
      type: "address",
      // The framework would resolve this before the helper ran, and the
      // resolution failing IS the answer — so the node arrives unevaluated.
      lazy: true,
      description:
        "A `::` call expression (or chain, or on-chain helper) to probe",
    },
    {
      name: "arrow",
      type: "string",
      optional: true,
      description: "`-!>` — expect a specific error",
    },
    {
      name: "error",
      type: "string",
      optional: true,
      description:
        "Error signature to match, e.g. `InsufficientBalance(uint256,uint256)` (`Error` and `Panic` work by bare name)",
    },
    {
      name: "lens",
      type: "array",
      optional: true,
      description:
        "Lens selecting one error argument as the value, e.g. `[_ $]`",
    },
  ],
  async run(_module, { call, arrow, error, lens }, { interpreters }) {
    const node = call as Node | undefined;
    if (!node) {
      throw new ErrorException(
        "@reverts expects a call argument, e.g. @reverts($token::symbol())",
      );
    }
    const clause = parseProbeClause([arrow, error, lens]);
    if (!clause && !PROBEABLE.has(node.type)) {
      throw new ErrorException(
        "@reverts needs a live call to probe, got a build-time constant",
      );
    }
    let abi: ReturnType<typeof errorAbiFromSignature> | undefined;
    if (clause) {
      checkProbedCall(node, clause);
      abi = errorAbiFromSignature(clause.errorName, clause.errorParams);
      if (clause.lens && abi.inputs.length === 0) {
        throw new ErrorException(
          `${clause.errorName} carries no arguments — there is nothing for a lens to select`,
        );
      }
    }

    try {
      await interpreters.interpretNode(node);
    } catch (err) {
      // Only the chain refusing the read answers `true`. A missing ABI, an
      // unknown variable or an unreachable node are the script or the setup
      // being wrong, and reporting those as "the call reverted" would be a
      // wrong answer dressed as a measurement.
      if (!isChainFailure(err)) throw err;
      if (!clause) return true;

      const selector = errorSelector(abi!);
      const data = extractRevertData(err);
      const matched =
        data !== undefined &&
        data.slice(0, 10).toLowerCase() === selector.toLowerCase();
      if (!clause.lens) return matched;
      if (!matched) {
        throw new ErrorException(
          `expected the call to revert with ${clause.errorName}, but it ${
            data ? `reverted with ${data.slice(0, 10)}…` : "reverted bare"
          }`,
        );
      }
      const decoded = decodeErrorResult({ abi: [abi!], data: data! });
      return selectDecodedArg(clause, abi!, decoded.args ?? []) as Param;
    }
    if (!clause) return false;
    if (!clause.lens) return false;
    throw new ErrorException(
      `expected the call to revert with ${clause.errorName}, but it resolved`,
    );
  },
  compile: async (ctx, node) => {
    const [callNode, ...rest] = node.args;
    if (!callNode) {
      throw new ErrorException(
        "@reverts! expects a call argument, e.g. @reverts!($token::symbol())",
      );
    }
    const clause = parseProbeClause(rest);

    if (!clause) {
      const o = await compileOperand(ctx, callNode);
      if (o.kind !== "call") {
        throw new ErrorException(
          "@reverts! needs a live call to probe, got a build-time constant",
        );
      }
      // The core primitive answers the positive question (1 when the
      // operand resolves), so the helper is its negation. `notCombine`
      // records the inner param as `notOf`, which `assert` folds into an
      // `Eq 0` constraint on the raw `isValid` operand — so a bare
      // `assert @reverts!(x)` costs no extra call, and only composition
      // inside `@bool!` materializes the eq.
      return notCombine(ctx, coreCall(ctx, encodeIsValid(o.param), "Bool"));
    }

    const call = checkProbedCall(callNode, clause);
    const abi = errorAbiFromSignature(clause.errorName, clause.errorParams);
    const selector = errorSelector(abi);

    // `revertData` performs the operand's staticcall in-frame, so the
    // reason it observes belongs to whatever the operand calls DIRECTLY.
    // Anything routed through the core (a multi-hop chain, live arguments,
    // a `::!` computed head) reverts with the core's own CallFailed and
    // the target's reason is lost — reject those instead of matching the
    // wrong error.
    const chain = await compileChain(ctx, call, { voidTail: true });
    if (!(chain.calls.length === 1 && chain.startAddress)) {
      throw new ErrorException(
        "-!> can only match the reason of a DIRECT call: one hop, literal target, build-time arguments. A chained or live-argument read routes through the core, where the target's revert becomes the core's own CallFailed and the reason is lost",
      );
    }
    const probed = chainParam(ctx, chain);
    const revertDataParam = staticCallParam(
      ctx.core,
      encodeRevertData(probed, selector),
    );

    if (!clause.lens) {
      // "Reverted with this reason" as a composable word. `validOf` lets a
      // bare `assert` drop the wrapper and judge a ZERO-constraint entry
      // on the raw revertData operand instead, so failures report
      // `DidNotRevert`/`UnexpectedRevertData` rather than a flat
      // ConstraintFailed.
      return {
        ...coreCall(ctx, encodeIsValid(revertDataParam), "Bool"),
        validOf: revertDataParam,
      };
    }

    if (abi.inputs.length === 0) {
      throw new ErrorException(
        `${clause.errorName} carries no arguments — there is nothing for a lens to select`,
      );
    }
    // The matched selector is stripped on-chain, so the revert payload is
    // a clean ABI tuple of the error's arguments: the same lens machinery
    // that selects a call's return value selects an error argument.
    const { data, terminal } = lensSelectData(
      revertDataParam,
      abi.inputs,
      clause.lens,
      `${clause.errorName} error`,
    );
    return {
      kind: "call",
      param: staticCallParam(ctx.core, data),
      cat: categoryFromAbiType(terminal.type),
    };
  },
});
