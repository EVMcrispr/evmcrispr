import { describe, it } from "bun:test";
import { BindingsManager, NodeType, Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { runParser } from "@evmcrispr/test-utils/evml";
import {
  createInterpreter,
  helperCacheKey,
  type InterpretCtx,
} from "../../../src/interpreter";
import { arrayExpressionParser } from "../../../src/parsers/array";

const makeInterpreter = () => {
  const ctx: InterpretCtx = {
    bindings: new BindingsManager(),
    chainId: 0,
    client: undefined,
    onError: "throw",
    resolveHelper: async () => undefined,
  };
  return createInterpreter(ctx);
};

const interpretArray = async (source: string): Promise<any> => {
  const node = runParser(arrayExpressionParser, source);
  return makeInterpreter().interpretNode(node);
};

describe("Interpreter - named args", () => {
  it("desugars a record literal to an entries array", async () => {
    const result = await interpretArray("[a:1 b:2]");
    expect(result).to.have.length(2);
    expect(result[0][0]).to.equal("a");
    expect(result[0][1].eq(new Num(1n))).to.be.true;
    expect(result[1][0]).to.equal("b");
    expect(result[1][1].eq(new Num(2n))).to.be.true;
  });

  it("nests records and arrays as record values", async () => {
    const result = await interpretArray('[meta:[id:1] tags:["x" "y"]]');
    expect(result[0][0]).to.equal("meta");
    expect(result[0][1][0][0]).to.equal("id");
    expect(result[1][1]).to.eql(["x", "y"]);
  });

  it("throws on mixed record/positional elements", async () => {
    let error: Error | undefined;
    try {
      await interpretArray("[1 a:2]");
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).to.include("cannot mix record entries");
  });

  it("evaluates a stray NamedArg to its value", async () => {
    const { interpretNode } = makeInterpreter();
    const result = await interpretNode({
      type: NodeType.NamedArg,
      name: "opt",
      value: { type: NodeType.StringLiteral, value: "v" },
    } as any);
    expect(result).to.equal("v");
  });

  it("keys the helper cache distinctly for named vs positional args", () => {
    const positional = helperCacheKey("h", ["1", "2"], 1);
    const named = helperCacheKey("h", ["1", "2"], 1, undefined, [
      undefined,
      "opt",
    ]);
    const quoted = helperCacheKey("h", ["1", "opt:2"], 1);
    expect(named).to.not.equal(positional);
    expect(named).to.not.equal(quoted);
    expect(positional).to.not.equal(quoted);
  });
});
