import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

const sampleJson = '{"name":"Alice","age":30,"tags":["a","b"],"nested":{"x":1}}';
const tokensJson = '{"tokens":[{"symbol":"DAI","address":"0x1"},{"symbol":"USDC","address":"0x2"},{"symbol":"WETH","address":"0x3"}]}';

describeHelper(
  "@json",
  {
    describeName: "Http > helpers > @json(data path)",
    module: "http",
    preamble: `set $data '${sampleJson}'`,
    cases: [
      {
        name: "should extract a string value",
        input: `@json($data "name")`,
        expected: "Alice",
      },
      {
        name: "should extract a number value",
        input: `@json($data "age")`,
        validate: (result) =>
          expect(result).to.be.instanceOf(Num),
      },
      {
        name: "should navigate nested objects",
        input: `@json($data "nested.x")`,
        validate: (result) =>
          expect(result).to.be.instanceOf(Num),
      },
      {
        name: "should access array elements by index",
        input: `@json($data "tags[0]")`,
        expected: "a",
      },
      {
        name: "should access array elements with negative index",
        input: `@json($data "tags[-1]")`,
        expected: "b",
      },
      {
        name: "should return an array",
        input: `@json($data "tags")`,
        validate: (result) => {
          expect(result).to.be.an("array").with.lengthOf(2);
          expect(result[0]).to.equal("a");
          expect(result[1]).to.equal("b");
        },
      },
      {
        name: "should stringify an object value",
        input: `@json($data "nested")`,
        expected: '{"x":1}',
      },
      {
        name: "should handle leading bracket path",
        input: `@json('[10,20,30]' "[1]")`,
        validate: (result) =>
          expect(result.eq(new Num(20n))).to.be.true,
      },
      {
        name: "should handle boolean values",
        input: `@json('{"ok":true}' "ok")`,
        expected: "true",
      },
      {
        name: "should handle null values",
        input: `@json('{"v":null}' "v")`,
        expected: "null",
      },
      {
        name: "should extract all values with [*]",
        input: `@json('${tokensJson}' "tokens[*].address")`,
        validate: (result) => {
          expect(result).to.be.an("array").with.lengthOf(3);
          expect(result[0]).to.equal("0x1");
          expect(result[1]).to.equal("0x2");
          expect(result[2]).to.equal("0x3");
        },
      },
      {
        name: "should extract all values with bare *",
        input: `@json('${tokensJson}' "tokens.*.symbol")`,
        validate: (result) => {
          expect(result).to.deep.equal(["DAI", "USDC", "WETH"]);
        },
      },
      {
        name: "should work with wildcard on a plain array",
        input: `@json('[[1,2],[3,4],[5,6]]' "[*][0]")`,
        validate: (result) => {
          expect(result).to.be.an("array").with.lengthOf(3);
          expect(result[0].eq(new Num(1n))).to.be.true;
          expect(result[1].eq(new Num(3n))).to.be.true;
          expect(result[2].eq(new Num(5n))).to.be.true;
        },
      },
    ],
    errorCases: [
      {
        name: "should fail when wildcard is used on a non-array",
        input: `@json($data "name[*]")`,
        error: "wildcard",
      },
      {
        name: "should fail on invalid JSON",
        input: `@json("not json" "x")`,
        error: "invalid JSON",
      },
      {
        name: "should fail when path resolves to undefined",
        input: `@json($data "missing")`,
        error: "undefined",
      },
      {
        name: "should fail on unclosed bracket",
        input: `@json($data "tags[0")`,
        error: "unclosed bracket",
      },
    ],
    sampleArgs: [`'{"a":1}'`, `"a"`],
  },
  helpers.json.argDefs,
);

describeHelper(
  "@json.format",
  {
    describeName: "Http > helpers > @json.format(template values)",
    module: "http",
    cases: [
      {
        name: "should format a flat object",
        input: `@json.format("{name, age}" ["Alice" 30])`,
        expected: '{"name":"Alice","age":30}',
      },
      {
        name: "should format a nested object",
        input: `@json.format("{name, job: {title, company}}" ["Alice" ["Engineer" "Acme"]])`,
        expected: '{"name":"Alice","job":{"title":"Engineer","company":"Acme"}}',
      },
      {
        name: "should format deeply nested objects",
        input: `@json.format("{a: {b: {c}}}" [[["val"]]])`,
        expected: '{"a":{"b":{"c":"val"}}}',
      },
      {
        name: "should handle boolean string values as JSON booleans",
        input: `@json.format("{active}" [true])`,
        expected: '{"active":true}',
      },
    ],
    errorCases: [
      {
        name: "should fail when template is not wrapped in braces",
        input: `@json.format("name, age" ["a" "b"])`,
        error: "must be wrapped",
      },
      {
        name: "should fail when not enough values",
        input: `@json.format("{name, age}" ["only_one"])`,
        error: "expected 2 values but got 1",
      },
      {
        name: "should fail when nested value is not an array",
        input: `@json.format("{job: {title}}" ["not_array"])`,
        error: "must be an array",
      },
    ],
    sampleArgs: [`"{name}"`, `["a"]`],
  },
  helpers["json.format"].argDefs,
);
