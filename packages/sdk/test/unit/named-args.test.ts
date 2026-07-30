import { describe, expect, it } from "bun:test";

import type { ArgDef, NamedArgNode, Node } from "../../src";
import {
  computeCommandArity,
  isRecordValue,
  NodeType,
  partitionHelperArgs,
  resolveHelperArgDef,
  unwrapNamedArg,
} from "../../src";

const lit = (value = "x"): Node => ({ type: NodeType.StringLiteral, value });
const namedArg = (name: string, value: Node = lit()): NamedArgNode => ({
  type: NodeType.NamedArg,
  name,
  value: value as NamedArgNode["value"],
});

const DEFS: ArgDef[] = [
  { name: "a", type: "string" },
  { name: "b", type: "string", optional: true },
  { name: "c", type: "string", optional: true },
];

describe("partitionHelperArgs", () => {
  it("splits positional and named args", () => {
    const { positional, named, issues } = partitionHelperArgs(
      [lit("1"), namedArg("c")],
      DEFS,
    );
    expect(positional).toHaveLength(1);
    expect(named.get("c")).toBeDefined();
    expect(issues).toHaveLength(0);
  });

  it("flags unknown names and suggests quoting", () => {
    const { issues } = partitionHelperArgs([namedArg("nope")], DEFS);
    expect(issues[0].code).toBe("unknown-named-arg");
    expect(issues[0].message).toContain("'nope:…'");
  });

  it("flags duplicates", () => {
    const { issues } = partitionHelperArgs(
      [namedArg("b"), namedArg("b")],
      DEFS,
    );
    expect(issues[0].code).toBe("duplicate-named-arg");
  });

  it("flags named before positional", () => {
    const { issues } = partitionHelperArgs([namedArg("b"), lit()], DEFS);
    expect(issues[0].code).toBe("named-before-positional");
  });

  it("flags a def filled both positionally and by name", () => {
    const { issues, named } = partitionHelperArgs(
      [lit(), lit(), namedArg("b")],
      DEFS,
    );
    expect(issues[0].code).toBe("named-arg-conflict");
    expect(named.has("b")).toBe(false);
  });

  it("rejects naming a rest arg", () => {
    const defs: ArgDef[] = [
      { name: "a", type: "string" },
      { name: "rest", type: "any", rest: true },
    ];
    const { issues } = partitionHelperArgs([lit(), namedArg("rest")], defs);
    expect(issues[0].code).toBe("unknown-named-arg");
  });

  it("namedOnly defs never conflict with positionals", () => {
    const defs: ArgDef[] = [
      { name: "src", type: "string" },
      { name: "runs", type: "number", namedOnly: true },
    ];
    const { issues, named, positional } = partitionHelperArgs(
      [lit(), namedArg("runs")],
      defs,
    );
    expect(issues).toHaveLength(0);
    expect(positional).toHaveLength(1);
    expect(named.has("runs")).toBe(true);
  });
});

describe("computeCommandArity with named args", () => {
  it("counts only positional args and unfilled defs", () => {
    // (a, b?, c?) called as (1 c:x) → positional 1 within [1..2].
    expect(
      computeCommandArity(DEFS, [lit(), namedArg("c")]).isError,
    ).toBe(false);
    // (a) missing entirely.
    expect(computeCommandArity(DEFS, [namedArg("c")]).isError).toBe(true);
  });

  it("ignores namedOnly defs in positional counting", () => {
    const defs: ArgDef[] = [
      { name: "src", type: "string" },
      { name: "runs", type: "number", namedOnly: true },
    ];
    expect(computeCommandArity(defs, [lit()]).isError).toBe(false);
    expect(
      computeCommandArity(defs, [lit(), namedArg("runs")]).isError,
    ).toBe(false);
    expect(computeCommandArity(defs, [lit(), lit()]).isError).toBe(true);
  });
});

describe("resolveHelperArgDef", () => {
  it("resolves named nodes by name and positional nodes by index", () => {
    const nodeArgs = [lit(), namedArg("c")];
    expect(resolveHelperArgDef(DEFS, nodeArgs, 0)?.name).toBe("a");
    expect(resolveHelperArgDef(DEFS, nodeArgs, 1)?.name).toBe("c");
    expect(resolveHelperArgDef(DEFS, [lit()], 1)?.name).toBe("b");
  });

  it("skips namedOnly defs for positional indices and maps rest tails", () => {
    const defs: ArgDef[] = [
      { name: "src", type: "string" },
      { name: "runs", type: "number", namedOnly: true },
      { name: "rest", type: "any", rest: true },
    ];
    expect(resolveHelperArgDef(defs, [lit()], 0)?.name).toBe("src");
    expect(resolveHelperArgDef(defs, [lit(), lit()], 1)?.name).toBe("rest");
    expect(resolveHelperArgDef(defs, [lit(), lit(), lit()], 2)?.name).toBe(
      "rest",
    );
  });
});

describe("unwrapNamedArg / isRecordValue", () => {
  it("unwraps named args and passes other nodes through", () => {
    const value = lit("v");
    expect(unwrapNamedArg(namedArg("a", value))).toBe(value);
    expect(unwrapNamedArg(value)).toBe(value);
  });

  it("validates entries-array shape", () => {
    expect(isRecordValue([["a", "1"]])).toBe(true);
    expect(isRecordValue([])).toBe(true);
    expect(isRecordValue([["a", "1"], ["b", ["1", "2"]]])).toBe(true);
    expect(isRecordValue(["a", "1"])).toBe(false);
    expect(isRecordValue([["a"]])).toBe(false);
    expect(isRecordValue("nope")).toBe(false);
  });
});
