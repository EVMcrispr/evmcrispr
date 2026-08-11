import { beforeAll, beforeEach, describe, it } from "bun:test";
import type { ErrorException, HelperArgDefEntry } from "@evmcrispr/sdk";
import { ComparisonType, NodeType, Num } from "@evmcrispr/sdk";
import { expect } from "chai";
import type { PublicClient } from "viem";
import { getPublicClient } from "../../client";
import {
  createInterpreter,
  interpretDoc,
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../evml";
import { expectThrowAsync } from "../expects";

export interface DocExample {
  /** Human-readable description — shown as a comment in the generated markdown. */
  description: string;
  /** Full EVML script to run. Shown as the code block in generated markdown. */
  code: string;
  /** Optional preamble prepended before the code when running as a test (not shown in docs). */
  preamble?: string;
}

export interface HelperTestCase {
  name?: string;
  input: string;
  expected?: string | number | bigint;
  /** Custom validation function, called with the interpreted result. */
  validate?: (result: any) => void | Promise<void>;
}

export interface HelperErrorCase {
  name?: string;
  input: string;
  /**
   * Error to match against. Can be:
   * - A string (checked via `.includes()` on the error message)
   * - A RegExp (checked via `.match()` on the error message)
   * - An ErrorException instance (checked via `expectThrowAsync`)
   * - A function `(helperNode) => ErrorException` for node-dependent errors
   */
  error:
    | string
    | RegExp
    | ErrorException
    | ((helperNode: any) => ErrorException);
}

export interface HelperTestConfig {
  /**
   * Module to load (e.g. "giveth"). May include an import list
   * (e.g. "lang [@map @filter]") — it becomes the `load` line verbatim.
   * Omit for std helpers (auto-loaded).
   */
  module?: string;
  /** Script preamble prepended before the expression (e.g. "set $std:tokenlist ..."). */
  preamble?: string;
  /** Happy-path test cases. */
  cases?: HelperTestCase[];
  /** Error test cases. */
  errorCases?: HelperErrorCase[];
  /** Documentation examples — tested as runnable scripts and included in generated docs. */
  docCases?: DocExample[];
  /**
   * Sample args for the arg-length validation test.
   * If omitted, auto-generated from argDefs using placeholder values.
   */
  sampleArgs?: string[];
  /** Skip auto-generated arg-length check. */
  skipArgLengthCheck?: boolean;
  /** Custom describe name override. */
  describeName?: string;
  /** Skip the entire describe block. */
  skip?: boolean;
  /** Runs before each case. For suites that need a fixture installed on
   *  the fork (see `installMockTarget`). Must be idempotent: it runs per
   *  case, because anvil_reset between packages discards any install. */
  setup?: (client: PublicClient) => Promise<void> | void;
}

const SAMPLE_VALUES: Record<string, string> = {
  address: "0x0000000000000000000000000000000000000001",
  array: "[1, 2]",
  string: "'placeholder'",
  number: "1",
  bytes: "0x00",
  bytes32: "0x0000000000000000000000000000000000000000000000000000000000000001",
  bool: "true",
  any: "'placeholder'",
};

function sampleForType(type: string | string[]): string {
  if (Array.isArray(type)) {
    for (const t of type) {
      if (SAMPLE_VALUES[t]) return SAMPLE_VALUES[t];
    }
    return "'placeholder'";
  }
  return SAMPLE_VALUES[type] ?? "'placeholder'";
}

function generateSampleArgs(argDefs: HelperArgDefEntry[]): string[] {
  return argDefs
    .filter((a) => !a.optional && !a.rest && !a.namedOnly)
    .map((a) => sampleForType(a.type));
}

function computeComparison(allArgDefs: HelperArgDefEntry[]) {
  // namedOnly defs never count positionally.
  const argDefs = allArgDefs.filter((a) => !a.namedOnly);
  const requiredCount = argDefs.filter((a) => !a.optional && !a.rest).length;
  const hasRest = argDefs.some((a) => a.rest);
  const hasOptional = argDefs.some((a) => a.optional);
  const totalFixed = argDefs.filter((a) => !a.rest).length;

  if (hasRest) {
    return { type: ComparisonType.Greater, minValue: requiredCount };
  }
  if (hasOptional) {
    return {
      type: ComparisonType.Between,
      minValue: requiredCount,
      maxValue: totalFixed,
    };
  }
  return { type: ComparisonType.Equal, minValue: requiredCount };
}

/**
 * Declarative test factory for EVMcrispr helper functions.
 *
 * Automatically generates:
 * - A `describe` block with a conventional name
 * - `it` blocks for each case
 * - `it` blocks for each error case
 * - Arg-length validation test derived from the helper's `argDefs`
 *
 * @param helperExpr - The helper name with `@` prefix, e.g. `"@token"` or `"@token:balance"`
 * @param config - Test configuration
 * @param argDefs - Arg definitions from the helper's metadata (from `_generated.ts`).
 *                  If provided, auto-generates arg-length validation.
 */
export function describeHelper(
  helperExpr: string,
  config: HelperTestConfig,
  argDefs?: HelperArgDefEntry[],
): void {
  const _helperName = helperExpr.startsWith("@")
    ? helperExpr.slice(1)
    : helperExpr;
  const atExpr = helperExpr.startsWith("@") ? helperExpr : `@${helperExpr}`;

  const label =
    config.describeName ??
    `${
      config.module ? `${capitalize(moduleBaseName(config.module))} >` : "Std >"
    } helpers > ${atExpr}`;

  const describeFn = config.skip ? describe.skip : describe;

  describeFn(label, () => {
    let client: PublicClient;
    const lazyClient = () => client;

    beforeAll(() => {
      client = getPublicClient();
    });

    if (config.setup) {
      beforeEach(async () => {
        await config.setup!(client);
      });
    }

    if (config.cases) {
      for (const c of config.cases) {
        const testName = c.name ?? `should interpret ${c.input} correctly`;
        it(testName, async () => {
          const [interpret] = await preparingExpression(
            c.input,
            client,
            config.module,
            config.preamble,
          );
          const result = await interpret();
          if (c.validate) {
            await c.validate(result);
          } else if (result instanceof Num && typeof c.expected === "bigint") {
            expect(result.eq(Num.fromBigInt(c.expected))).to.be.true;
          } else {
            expect(result).to.deep.equal(c.expected);
          }
        });
      }
    }

    if (config.errorCases) {
      for (const ec of config.errorCases) {
        const testName = ec.name ?? `should fail for ${ec.input}`;
        it(testName, async () => {
          const [interpret, helperNode] = await preparingExpression(
            ec.input,
            client,
            config.module,
            config.preamble,
          );

          if (typeof ec.error === "function") {
            const errorObj = ec.error(helperNode);
            await expectThrowAsync(() => interpret(), errorObj);
          } else {
            try {
              await interpret();
              throw new Error("Expected expression to throw");
            } catch (err: any) {
              if (typeof ec.error === "string") {
                expect(err.message).to.include(ec.error);
              } else if (ec.error instanceof RegExp) {
                expect(err.message).to.match(ec.error);
              } else {
                if (ec.error.message?.length) {
                  expect(err.message).to.equal(ec.error.message);
                }
                expect(err.constructor.name).to.equal(
                  ec.error.constructor.name,
                );
              }
            }
          }
        });
      }
    }

    if (config.docCases) {
      for (const doc of config.docCases) {
        it(`[DOC] ${doc.description}`, async () => {
          const preamble =
            doc.preamble ??
            (config.module ? `load ${config.module}` : undefined);
          const fullScript = preamble ? `${preamble}\n${doc.code}` : doc.code;
          const interpreter = createInterpreter(fullScript, client);
          await interpretDoc(interpreter);
        });
      }
    }

    if (!config.skipArgLengthCheck && argDefs) {
      const sampleArgs = config.sampleArgs ?? generateSampleArgs(argDefs);
      const comparison = computeComparison(argDefs);

      itChecksInvalidArgsLength(
        NodeType.HelperFunctionExpression,
        atExpr,
        sampleArgs,
        comparison,
        lazyClient,
        config.module,
      );
    }
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Strip an import list from a module spec ("lang [@map]" → "lang"). */
function moduleBaseName(moduleSpec: string): string {
  return moduleSpec.split(/[\s[]/)[0];
}
