import { afterEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";

import { useSmallScreen } from "../../src/hooks/useSmallScreen";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("useSmallScreen", () => {
  test("tracks the 768px media query", () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const queries: string[] = [];
    // Only a below-768px query matches — a hook subscribing to the wrong
    // query gets `matches: false` and the test fails.
    window.matchMedia = ((query: string) => {
      queries.push(query);
      return {
        matches: query === "(max-width: 767px)",
        media: query,
        onchange: null,
        addEventListener: (
          _type: string,
          next: (event: MediaQueryListEvent) => void,
        ) => {
          listener = next;
        },
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;

    const { result } = renderHook(() => useSmallScreen());
    // Initial-state read + effect subscription both hit matchMedia; every
    // call must use the same below-768px query.
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) expect(query).toBe("(max-width: 767px)");
    expect(result.current).toBe(true);

    act(() => listener?.({ matches: false } as MediaQueryListEvent));
    expect(result.current).toBe(false);
  });
});
