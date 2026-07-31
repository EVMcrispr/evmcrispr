import { useEvmlTag } from "@evmcrispr/editor";
import type { Action, BatchedAction } from "@evmcrispr/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keccak256, toBytes } from "viem";
import { workerEvml } from "../evml/workerEvml";

export type ReviewDiagnostic = {
  line: number;
  col: number;
  severity: string;
  message: string;
};

export type TransactionReviewState =
  | { status: "idle"; diagnostics: ReviewDiagnostic[] }
  | { status: "validating"; diagnostics: ReviewDiagnostic[] }
  | { status: "valid"; diagnostics: ReviewDiagnostic[] }
  | { status: "simulating"; diagnostics: ReviewDiagnostic[] }
  | {
      status: "ready";
      diagnostics: ReviewDiagnostic[];
      actions: Action[];
      logs: string[];
      fingerprint: `0x${string}`;
    }
  | {
      status: "error";
      diagnostics: ReviewDiagnostic[];
      message: string;
      actions: Action[];
      logs: string[];
    };

const EMPTY_STATE: TransactionReviewState = {
  status: "idle",
  diagnostics: [],
};

function mapDiagnostics(
  diagnostics: Array<{
    line: number;
    col: number;
    severity: string;
    message: string;
  }>,
): ReviewDiagnostic[] {
  return diagnostics.map(({ line, col, severity, message }) => ({
    line,
    col,
    severity,
    message,
  }));
}

function isBatchedAction(action: Action): action is BatchedAction {
  return "type" in action && action.type === "batched";
}

export function countReviewActions(actions: Action[]) {
  return actions.reduce(
    (count, action) =>
      count + (isBatchedAction(action) ? action.actions.length : 1),
    0,
  );
}

export function useTransactionReview(
  script: string,
  address: `0x${string}` | undefined,
  options: { autoValidate?: boolean } = {},
) {
  const tag = useEvmlTag();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<TransactionReviewState>(EMPTY_STATE);
  const autoValidate = options.autoValidate ?? false;

  const fingerprint = useMemo(
    () =>
      keccak256(
        toBytes(`${address?.toLowerCase() ?? "no-account"}\0${script}`),
      ),
    [address, script],
  );

  const validate = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState({ status: "validating", diagnostics: [] });
    const result = await tag.script(script).validate();
    if (requestId !== requestIdRef.current) return null;

    const diagnostics = mapDiagnostics(result.diagnostics);
    if (!result.valid) {
      setState({
        status: "error",
        diagnostics,
        message: "Fix the validation errors before simulating.",
        actions: [],
        logs: [],
      });
      return null;
    }

    setState({ status: "valid", diagnostics });
    return { requestId, diagnostics };
  }, [script, tag]);

  // Invalidate (and optionally re-validate) whenever script or account
  // change. Auto-validation must live in the same effect as the reset:
  // a validate() started from a child component's effect in the same commit
  // would be cancelled by this reset (child effects flush first).
  // Called through a ref so the effect keys on the fingerprint alone —
  // depending on validate's identity would re-fire (and loop, via its
  // setState) whenever the provider hands out a fresh tag.
  const validateRef = useRef(validate);
  useEffect(() => {
    validateRef.current = validate;
  }, [validate]);
  useEffect(() => {
    void fingerprint;
    requestIdRef.current++;
    setState(EMPTY_STATE);
    if (autoValidate) void validateRef.current();
  }, [fingerprint, autoValidate]);

  const prepare = useCallback(async () => {
    const validated = await validate();
    if (!validated) return;

    setState({
      status: "simulating",
      diagnostics: validated.diagnostics,
    });

    try {
      const result = await workerEvml
        .script(script)
        .simulate({ from: address });
      if (validated.requestId !== requestIdRef.current) return;

      if (!result.success) {
        setState({
          status: "error",
          diagnostics: validated.diagnostics,
          message: result.error ?? "The fork simulation failed.",
          actions: result.actions,
          logs: result.logs,
        });
        return;
      }

      setState({
        status: "ready",
        diagnostics: validated.diagnostics,
        actions: result.actions,
        logs: result.logs,
        fingerprint,
      });
    } catch (error) {
      if (validated.requestId !== requestIdRef.current) return;
      setState({
        status: "error",
        diagnostics: validated.diagnostics,
        message:
          error instanceof Error ? error.message : "The simulation failed.",
        actions: [],
        logs: [],
      });
    }
  }, [address, fingerprint, script, validate]);

  const reset = useCallback(() => {
    requestIdRef.current++;
    setState(EMPTY_STATE);
  }, []);

  const isStale = state.status === "ready" && state.fingerprint !== fingerprint;

  return {
    state,
    prepare,
    reset,
    isStale,
    canExecute: state.status === "ready" && !isStale,
    actionCount:
      state.status === "ready" || state.status === "error"
        ? countReviewActions(state.actions)
        : 0,
  };
}
