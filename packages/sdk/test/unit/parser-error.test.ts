import { describe, expect, it } from "bun:test";

import type { NodeParserState } from "../../src";
import { buildParserError } from "../../src";

const err = (
  error: string,
  { line = 1, offset = 0, index = 0 } = {},
): Parameters<typeof buildParserError>[0] => ({
  isError: true,
  error,
  index,
  data: { line, offset, errors: [] } as NodeParserState,
});

describe("buildParserError", () => {
  it("emits the single-position format", () => {
    expect(buildParserError(err("x", { index: 5 }), "MyError", "boom")).toBe(
      "MyError(1:5): boom",
    );
  });

  it("emits a two-position range when an end is given", () => {
    expect(
      buildParserError(err("x", { index: 2 }), "MyError", "boom", {
        line: 3,
        col: 7,
      }),
    ).toBe("MyError(1:2,3:7): boom");
  });

  it("appends a trailing received value from the raw error", () => {
    expect(
      buildParserError(err("expected foo, got bar"), "MyError", "boom"),
    ).toBe("MyError(1:0): boom, got bar");
  });

  it("does not mistake the word 'got' inside the message for a value", () => {
    // Only a trailing "got …" from the raw error is treated as a value; the
    // custom message may itself contain the word "got".
    expect(
      buildParserError(err("no match here"), "MyError", "forgot the paren"),
    ).toBe("MyError(1:0): forgot the paren");
  });

  it("computes the column relative to the line offset", () => {
    expect(
      buildParserError(err("x", { index: 12, offset: 4 }), "MyError", "boom"),
    ).toBe("MyError(1:8): boom");
  });
});
