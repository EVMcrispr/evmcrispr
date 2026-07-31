import { describe, expect, test } from "bun:test";

import { PAGE_CHAR_BUDGET, truncate } from "@evmcrispr/ai";

describe("truncate", () => {
  test("leaves short text untouched", () => {
    expect(truncate("short")).toBe("short");
  });

  test("cuts at the budget and appends a notice", () => {
    const long = "a".repeat(PAGE_CHAR_BUDGET + 500);
    const out = truncate(long);
    expect(out.startsWith("a".repeat(PAGE_CHAR_BUDGET))).toBe(true);
    expect(out).toContain(`Truncated at ${PAGE_CHAR_BUDGET} characters`);
    expect(out).toContain("500 more not shown");
  });
});
