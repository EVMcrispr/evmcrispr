import { expect, test } from "bun:test";
import { lineRuns } from "../../src/lineRuns";

test("consecutive lines become one run; lines the text does not have are dropped", () => {
  expect(lineRuns([], 10)).toEqual([]);
  expect(lineRuns([2, 3, 4, 7, 9, 10], 10)).toEqual([
    [2, 4],
    [7, 7],
    [9, 10],
  ]);
  expect(lineRuns([5, 1, 2, 0, 12], 6)).toEqual([
    [1, 2],
    [5, 5],
  ]);
});
