import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Action } from "@evmcrispr/sdk";
import { act, renderHook, waitFor } from "@testing-library/react";

// mock.module is process-global in bun — no other test file imports
// @evmcrispr/editor or workerEvml (verified); keep it that way.
type Deferred = {
  source: string;
  resolve: (result: { valid: boolean; diagnostics: unknown[] }) => void;
};
let pendingValidations: Deferred[] = [];

mock.module("@evmcrispr/editor", () => ({
  useEvmlTag: () => ({
    script: (source: string) => ({
      validate: () =>
        new Promise((resolve) => pendingValidations.push({ source, resolve })),
    }),
  }),
}));

mock.module("../../src/evml/workerEvml", () => ({
  workerEvml: {
    script: () => ({
      simulate: async () => ({ success: true, actions: [], logs: [] }),
    }),
  },
}));

const { countReviewActions, useTransactionReview } = await import(
  "../../src/hooks/useTransactionReview"
);

const ADDRESS = "0x0000000000000000000000000000000000000001";

beforeEach(() => {
  pendingValidations = [];
});

describe("countReviewActions", () => {
  test("counts individual and batched wallet calls", () => {
    const actions: Action[] = [
      { to: ADDRESS, data: "0x" },
      {
        type: "batched",
        chainId: 1,
        from: ADDRESS,
        actions: [
          { to: ADDRESS, data: "0x01" },
          { to: ADDRESS, data: "0x02" },
        ],
      },
    ];

    expect(countReviewActions(actions)).toBe(3);
  });
});

describe("useTransactionReview autoValidate", () => {
  test("validates on mount and keeps the result", async () => {
    const { result } = renderHook(() =>
      useTransactionReview("print 1", undefined, { autoValidate: true }),
    );

    await waitFor(() => expect(pendingValidations).toHaveLength(1));
    expect(result.current.state.status).toBe("validating");

    await act(async () => {
      pendingValidations[0].resolve({ valid: true, diagnostics: [] });
    });
    expect(result.current.state.status).toBe("valid");
  });

  test("revalidates when the script changes", async () => {
    const { result, rerender } = renderHook(
      ({ script }: { script: string }) =>
        useTransactionReview(script, undefined, { autoValidate: true }),
      { initialProps: { script: "print 1" } },
    );

    await waitFor(() => expect(pendingValidations).toHaveLength(1));
    await act(async () => {
      pendingValidations[0].resolve({ valid: true, diagnostics: [] });
    });
    expect(result.current.state.status).toBe("valid");

    rerender({ script: "print 2" });
    await waitFor(() => expect(pendingValidations).toHaveLength(2));
    expect(pendingValidations[1].source).toBe("print 2");

    await act(async () => {
      pendingValidations[1].resolve({ valid: true, diagnostics: [] });
    });
    expect(result.current.state.status).toBe("valid");
  });

  test("discards a stale validation that resolves after a script change", async () => {
    const { result, rerender } = renderHook(
      ({ script }: { script: string }) =>
        useTransactionReview(script, undefined, { autoValidate: true }),
      { initialProps: { script: "print 1" } },
    );

    await waitFor(() => expect(pendingValidations).toHaveLength(1));
    rerender({ script: "print 2" });
    await waitFor(() => expect(pendingValidations).toHaveLength(2));

    // The first (now stale) validation resolves late — it must not win.
    await act(async () => {
      pendingValidations[0].resolve({ valid: true, diagnostics: [] });
    });
    expect(result.current.state.status).toBe("validating");

    await act(async () => {
      pendingValidations[1].resolve({ valid: false, diagnostics: [] });
    });
    expect(result.current.state.status).toBe("error");
  });

  test("does not validate without autoValidate", async () => {
    const { result } = renderHook(() =>
      useTransactionReview("print 1", undefined),
    );

    // Let effects flush; nothing should have been requested.
    await act(async () => {});
    expect(pendingValidations).toHaveLength(0);
    expect(result.current.state.status).toBe("idle");
  });
});
