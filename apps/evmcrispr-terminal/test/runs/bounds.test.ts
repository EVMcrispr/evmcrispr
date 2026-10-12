import { expect, test } from "bun:test";
import { IMPORT_LIMITS } from "@evmcrispr/space";
import { appendOutput, boundErrors, OUTPUT_CUT } from "../../src/runs/bounds";

test("a run's output stops growing at what an export may hold, and says so once", () => {
  let output = "";
  const line = "x".repeat(100_000);
  for (let i = 0; i < 30; i++) output = appendOutput(output, line);
  expect(output.length).toBeLessThanOrEqual(IMPORT_LIMITS.output);
  expect(output.endsWith(OUTPUT_CUT)).toBe(true);
  expect(output.split(OUTPUT_CUT)).toHaveLength(2);
  expect(appendOutput("a\n", "b")).toBe("a\nb\n");
  // One huge line.
  expect(appendOutput("", "x".repeat(IMPORT_LIMITS.output * 2))).toBe(
    OUTPUT_CUT,
  );
});

test("a run's errors are kept to a bounded few of bounded length", () => {
  const errors = boundErrors(
    Array.from({ length: 5_000 }, () => "e".repeat(50_000)),
  );
  expect(errors.length).toBeLessThanOrEqual(100);
  expect(Math.max(...errors.map((e) => e.length))).toBeLessThanOrEqual(
    IMPORT_LIMITS.error,
  );
  expect(boundErrors(["boom"])).toEqual(["boom"]);
});
