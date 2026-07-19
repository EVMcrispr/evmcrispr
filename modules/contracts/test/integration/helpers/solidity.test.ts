import "../../setup";
import { beforeAll, expect } from "bun:test";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";
import { fetchReleaseList, loadCompiler } from "../../../src/utils/solcLoader";

// One shared source across cases so the compile cache means a single real
// solc run per (source, options) pair.
const SRC =
  "pragma solidity 0.8.26; contract Counter { uint256 public n; function inc() public { n++; } }";
const SRC_ARG = `'${SRC}'`;
const URL_COUNTER = "https://sources.example.com/Counter.sol";
const URL_PARENT = "https://sources.example.com/Parent.sol";

const NPM_SRC =
  'pragma solidity 0.8.26; import "@fake/lib/contracts/FakeLib.sol"; contract UsesLib { function four() public pure returns (uint256) { return FakeLib.twice(2); } }';

// Pre-warm the compiler download (~9 MB on first use) so individual tests
// stay well inside the per-test timeout.
beforeAll(async () => {
  const { releases } = await fetchReleaseList();
  await loadCompiler(releases["0.8.26"]);
}, 120_000);

describeHelper(
  "@contracts:solidity",
  {
    module: "contracts",
    cases: [
      {
        name: "compiles inline source to creation bytecode",
        input: `@contracts:solidity(${SRC_ARG})`,
        validate: (result) => {
          expect(typeof result).toBe("string");
          expect(result.startsWith("0x60")).toBe(true);
          expect(result.length).toBeGreaterThan(100);
        },
      },
      {
        name: "compiles a URL source",
        input: `@contracts:solidity('${URL_COUNTER}')`,
        validate: (result) => {
          expect(result.startsWith("0x60")).toBe(true);
        },
      },
      {
        name: "crawls relative imports from a URL root",
        input: `@contracts:solidity('${URL_PARENT}')`,
        validate: (result) => {
          expect(result.startsWith("0x60")).toBe(true);
        },
      },
      {
        name: "resolves npm-style imports via unpkg (with in-package relative imports)",
        input: `@contracts:solidity('${NPM_SRC}')`,
        validate: (result) => {
          expect(result.startsWith("0x60")).toBe(true);
        },
      },
    ],
    errorCases: [
      {
        name: "should fail on a 404 source URL",
        input: `@contracts:solidity('https://sources.example.com/Missing.sol')`,
        error: "@solidity: 404",
      },
      {
        name: "should fail when the source has no deployable contract",
        input: `@contracts:solidity('pragma solidity 0.8.26; interface IThing { function f() external; }')`,
        error: "no deployable contract",
      },
      {
        name: "should fail listing candidates when several contracts are deployable",
        input: `@contracts:solidity('pragma solidity 0.8.26; contract A {} contract B {}')`,
        error: "several deployable contracts",
      },
      {
        name: "should fail on unknown options",
        input: `@contracts:solidity(${SRC_ARG} 'turbo:on')`,
        error: 'unknown option "turbo:on"',
      },
      {
        name: "should fail on an unsatisfiable pragma (below the 0.6.0 floor)",
        input: `@contracts:solidity('pragma solidity ^0.4.24; contract Old {}')`,
        error: "no solc release",
      },
      {
        name: "should fail on an unknown pinned release",
        input: `@contracts:solidity(${SRC_ARG} 'version:9.9.9')`,
        error: 'unknown solc release "9.9.9"',
      },
      {
        name: "should fail on relative imports in inline source",
        input: `@contracts:solidity('pragma solidity 0.8.26; import "./Lib.sol"; contract A {}')`,
        error: "not supported in inline source",
      },
      {
        name: "should fail on a Solidity compile error",
        input: `@contracts:solidity('pragma solidity 0.8.26; contract Broken { function f() public { revert( } }')`,
        error: "compilation failed",
      },
    ],
    sampleArgs: [SRC_ARG],
    docCases: [
      {
        description: "Compile and deploy an inline contract",
        code: `set $src <<<SOL
pragma solidity 0.8.26;
contract Counter {
  uint256 public n;
  function inc() public { n++; }
}
SOL
contracts:deploy $counter @contracts:solidity($src)`,
      },
      {
        description:
          "Compile a contract hosted at a URL with custom compiler options",
        code: `set $url 'https://sources.example.com/Counter.sol'
contracts:deploy $counter @contracts:solidity($url 'runs:1000' 'via-ir')`,
      },
    ],
  },
  helpers.solidity.argDefs,
);

describeHelper(
  "@contracts:solidity.standardJson",
  {
    module: "contracts",
    cases: [
      {
        name: "returns the exact standard-json input that was compiled",
        input: `@contracts:solidity.standardJson(${SRC_ARG})`,
        validate: (result) => {
          const json = JSON.parse(result);
          expect(json.language).toBe("Solidity");
          expect(json.sources["input.sol"].content).toBe(SRC);
          expect(json.settings.optimizer).toEqual({
            enabled: true,
            runs: 200,
          });
          expect(json.settings.viaIR).toBeUndefined();
        },
      },
      {
        name: "reflects runs / via-ir / optimizer:off options in settings",
        input: `@contracts:solidity.standardJson(${SRC_ARG} 'runs:1000' 'via-ir')`,
        validate: (result) => {
          const json = JSON.parse(result);
          expect(json.settings.optimizer).toEqual({
            enabled: true,
            runs: 1000,
          });
          expect(json.settings.viaIR).toBe(true);
        },
      },
      {
        name: "includes the whole import closure in sources",
        input: `@contracts:solidity.standardJson('${URL_PARENT}')`,
        validate: (result) => {
          const json = JSON.parse(result);
          expect(Object.keys(json.sources)).toEqual([
            URL_PARENT,
            "https://sources.example.com/Child.sol",
          ]);
        },
      },
      {
        name: "keys npm-style imports by their package path",
        input: `@contracts:solidity.standardJson('${NPM_SRC}')`,
        validate: (result) => {
          const json = JSON.parse(result);
          expect(Object.keys(json.sources).sort()).toEqual([
            "@fake/lib/contracts/FakeLib.sol",
            "@fake/lib/contracts/FakeUtil.sol",
            "input.sol",
          ]);
        },
      },
    ],
    sampleArgs: [SRC_ARG],
    docCases: [
      {
        description:
          "Inspect the compiler settings embedded in the verification payload",
        code: `set $json @contracts:solidity.standardJson('https://sources.example.com/Counter.sol')
print $json`,
      },
    ],
  },
  helpers["solidity.standardJson"].argDefs,
);

describeHelper(
  "@contracts:solidity.contract",
  {
    module: "contracts",
    cases: [
      {
        name: "returns the qualified name for inline source",
        input: `@contracts:solidity.contract(${SRC_ARG})`,
        expected: "input.sol:Counter",
      },
      {
        name: "returns the qualified name for a URL source",
        input: `@contracts:solidity.contract('${URL_COUNTER}')`,
        expected: `${URL_COUNTER}:Counter`,
      },
      {
        name: "honors the contract: option",
        input: `@contracts:solidity.contract('pragma solidity 0.8.26; contract A {} contract B {}' 'contract:B')`,
        expected: "input.sol:B",
      },
    ],
    sampleArgs: [SRC_ARG],
    docCases: [
      {
        description: "Get the qualified contract name for verification",
        code: `set $name @contracts:solidity.contract('https://sources.example.com/Counter.sol')
print $name`,
      },
    ],
  },
  helpers["solidity.contract"].argDefs,
);

describeHelper(
  "@contracts:solidity.compiler",
  {
    module: "contracts",
    cases: [
      {
        name: "returns the long compiler version selected from the pragma",
        input: `@contracts:solidity.compiler(${SRC_ARG})`,
        expected: "0.8.26+commit.8a97fa7a",
      },
      {
        name: "honors an explicit version pin",
        input: `@contracts:solidity.compiler('pragma solidity ^0.8.0; contract Pinned {}' 'version:0.8.20')`,
        expected: "0.8.20+commit.a1b79de6",
      },
    ],
    sampleArgs: [SRC_ARG],
    docCases: [
      {
        description: "Get the compiler version string for verification",
        code: `set $compiler @contracts:solidity.compiler('https://sources.example.com/Counter.sol')
print $compiler`,
      },
    ],
  },
  helpers["solidity.compiler"].argDefs,
);
