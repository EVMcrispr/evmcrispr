import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { parseSignature } from "../../src/utils/parseSignature";

describe("parseSignature", () => {
  it("should parse an empty string to no params", () => {
    const result = parseSignature("");
    expect(result.params).to.deep.equal([]);
    expect(result.opts).to.deep.equal([]);
    expect(result.returnType).to.be.undefined;
  });

  it("should parse a return-type-only string (constant shorthand)", () => {
    const result = parseSignature("address");
    expect(result.params).to.deep.equal([]);
    expect(result.opts).to.deep.equal([]);
    expect(result.returnType).to.equal("address");
  });

  it("should parse a single required param", () => {
    const result = parseSignature("$n: number");
    expect(result.params).to.deep.equal([{ name: "n", type: "number" }]);
    expect(result.opts).to.deep.equal([]);
  });

  it("should parse multiple required params", () => {
    const result = parseSignature("$a: number $b: address");
    expect(result.params).to.have.length(2);
    expect(result.params[0]).to.deep.equal({ name: "a", type: "number" });
    expect(result.params[1]).to.deep.equal({ name: "b", type: "address" });
  });

  it("should parse optional params", () => {
    const result = parseSignature("$a: number [$b: number]");
    expect(result.params).to.have.length(2);
    expect(result.params[0]).to.deep.equal({ name: "a", type: "number" });
    expect(result.params[1]).to.deep.equal({
      name: "b",
      type: "number",
      optional: true,
    });
  });

  it("should parse rest params", () => {
    const result = parseSignature("$label: string ...$values: number");
    expect(result.params).to.have.length(2);
    expect(result.params[0]).to.deep.equal({ name: "label", type: "string" });
    expect(result.params[1]).to.deep.equal({
      name: "values",
      type: "number",
      rest: true,
    });
  });

  it("should parse options", () => {
    const result = parseSignature("$a: number [--target: address]");
    expect(result.params).to.deep.equal([{ name: "a", type: "number" }]);
    expect(result.opts).to.deep.equal([{ name: "target", type: "address" }]);
  });

  it("should parse return type with arrow syntax", () => {
    const result = parseSignature("$n: number -> bool");
    expect(result.params).to.deep.equal([{ name: "n", type: "number" }]);
    expect(result.returnType).to.equal("bool");
  });

  it("should parse a complex signature with params, options, and return type", () => {
    const result = parseSignature(
      "$a: number [$b: number] [--verbose: bool] -> number",
    );
    expect(result.params).to.have.length(2);
    expect(result.params[0]).to.deep.equal({ name: "a", type: "number" });
    expect(result.params[1]).to.deep.equal({
      name: "b",
      type: "number",
      optional: true,
    });
    expect(result.opts).to.deep.equal([{ name: "verbose", type: "bool" }]);
    expect(result.returnType).to.equal("number");
  });

  it("should throw when required param follows optional", () => {
    expect(() => parseSignature("[$a: number] $b: number")).to.throw(
      "required parameters must come before optional ones",
    );
  });

  it("should throw when rest param is not last", () => {
    expect(() => parseSignature("...$a: number $b: string")).to.throw(
      "rest parameter must be the last parameter",
    );
  });

  it("should throw on multiple rest params", () => {
    expect(() => parseSignature("...$a: number ...$b: string")).to.throw(
      "only one rest parameter is allowed",
    );
  });

  it("should parse a helper param (@name)", () => {
    const result = parseSignature("$arr: array @fn");
    expect(result.params).to.have.length(2);
    expect(result.params[0]).to.deep.equal({ name: "arr", type: "array" });
    expect(result.params[1]).to.deep.equal({ name: "fn", type: "helper" });
  });

  it("should parse multiple helper params", () => {
    const result = parseSignature("$arr: array @h1 @h2");
    expect(result.params).to.have.length(3);
    expect(result.params[0]).to.deep.equal({ name: "arr", type: "array" });
    expect(result.params[1]).to.deep.equal({ name: "h1", type: "helper" });
    expect(result.params[2]).to.deep.equal({ name: "h2", type: "helper" });
  });

  it("should parse helper params with return type", () => {
    const result = parseSignature("$arr: array @fn -> array");
    expect(result.params).to.have.length(2);
    expect(result.params[1]).to.deep.equal({ name: "fn", type: "helper" });
    expect(result.returnType).to.equal("array");
  });

  it("should parse a signature with only helper params", () => {
    const result = parseSignature("@fn");
    expect(result.params).to.deep.equal([{ name: "fn", type: "helper" }]);
    expect(result.opts).to.deep.equal([]);
  });
});
