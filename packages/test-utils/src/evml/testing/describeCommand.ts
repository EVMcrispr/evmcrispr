import { beforeAll, describe, it } from "bun:test";
import type { Action, ErrorException } from "@evmcrispr/sdk";
import { expect } from "chai";
import type { PublicClient } from "viem";
import inventory from "../../../../../scripts/smart-command-inventory.json";
import { getPublicClient } from "../../client";
import { createInterpreter, interpretDoc, type TestInterpreter } from "../evml";
import { assertErrorMatches, expectThrowAsync } from "../expects";
import {
  checkDeclaredErrorCases,
  type DeclaredErrorExpectation,
  type DeclaredErrorsSource,
  expectDeclaredFailure,
} from "./declaredErrors";
import type { DocExample } from "./describeHelper";
import { checkSmartCommandFields } from "./smartCommand";

export interface CommandTestCase {
  name: string;
  script: string;
  expectedActions?: Action[];
  /** Per-test timeout in ms (e.g. sim:fork cases outlive bun's 5s default). */
  timeout?: number;
  /** Run before interpretation to capture pre-test state. Return value is passed to `validate`. */
  setup?: (client: PublicClient) => Promise<any> | any;
  validate?: (
    result: Action[],
    interpreter: TestInterpreter,
    setupData?: any,
  ) => void | Promise<void>;
}

export interface CommandErrorCase {
  name: string;
  script: string;
  /** Message assertion. Optional only when `declared` says what to expect. */
  error?:
    | string
    | RegExp
    | ErrorException
    | ((interpreter: TestInterpreter) => ErrorException);
  /**
   * The declared error (`errors:` on the definition, raised with `fail`)
   * this case expects, by name and optionally by field. Verified through the
   * failure's bounded cause chain, so an interpreter or helper wrapper around
   * it is fine. Combine with `error` to also pin the raise-site message.
   */
  declared?: DeclaredErrorExpectation;
}

export interface CommandTestConfig {
  /**
   * Module to load (e.g. "giveth"). May include an import list
   * (e.g. "safe [propose @nonce]") — it becomes the `load` line verbatim.
   * Omit for std commands (auto-loaded).
   */
  module?: string;
  /** Script preamble prepended to every test case (e.g. "load aragonos [connect grant]"). */
  preamble?: string;
  /** Happy-path test cases. */
  cases?: CommandTestCase[];
  /** Explicit successful fixture when ordinary examples select a build-time-only route. */
  smartCases?: CommandTestCase[];
  /** Error test cases. */
  errorCases?: CommandErrorCase[];
  /**
   * The command's declaration metadata (the definition, or its `errors`
   * block). Given it, the suite refuses to register unless every declared
   * name has an error case designating it with `declared`.
   */
  declaredErrors?: DeclaredErrorsSource;
  /** Documentation examples — tested as runnable scripts and included in generated docs. */
  docCases?: DocExample[];
  /** Start the interpreter on this chain instead of gnosis. For faces that
   *  are chain-specific, e.g. the mainnet-only `@ens:*!` reads. */
  chainId?: number;
  /** Custom describe name override. */
  describeName?: string;
  /** Skip the entire describe block. */
  skip?: boolean;
}

/**
 * Declarative test factory for EVMcrispr commands.
 *
 * Automatically generates:
 * - A `describe` block with a conventional name
 * - `it` blocks for each success case (comparing actions or running custom validation)
 * - `it` blocks for each error case
 *
 * @param commandName - The command name, e.g. `"exec"` or `"grant"`
 * @param config - Test configuration
 */
export function describeCommand(
  commandName: string,
  config: CommandTestConfig,
): void {
  const label =
    config.describeName ??
    `${config.module ? `${capitalize(moduleBaseName(config.module))} >` : "Std >"} commands > ${commandName}`;

  // Synchronous, before a single `it` is registered: a coverage gap is a
  // registration failure, not a test whose verdict depends on what else ran.
  checkDeclaredErrorCases(
    label,
    config.errorCases ?? [],
    config.declaredErrors,
    (c, i) => (c.name ? `"${c.name}"` : `#${i + 1}`),
  );

  const describeFn = config.skip ? describe.skip : describe;

  describeFn(label, () => {
    let client: PublicClient;

    beforeAll(() => {
      client = getPublicClient();
    });

    if (config.cases) {
      for (const c of config.cases) {
        const testCase = async () => {
          let setupData: any;
          if (c.setup) setupData = await c.setup(client);

          const fullScript = config.preamble
            ? `${config.preamble}\n${c.script}`
            : c.script;
          const interpreter = createInterpreter(fullScript, client, {
            chainId: config.chainId,
          });
          const actions = await interpreter.interpret();

          if (c.expectedActions) {
            expect(actions).to.eql(c.expectedActions);
          }
          if (c.validate) {
            await c.validate(actions, interpreter, setupData);
          }
        };
        if (c.timeout !== undefined) it(c.name, testCase, c.timeout);
        else it(c.name, testCase);
      }
    }

    const inventoryKey = `${config.module ? moduleBaseName(config.module) : "std"}/${commandName}`;
    if (
      (inventory as Record<string, { kind: string }>)[inventoryKey]?.kind ===
        "runtime" &&
      config.cases?.length
    ) {
      it(
        "[SMART] compiles declared runtime fields from the protocol fixture",
        () => checkSmartCommandFields(commandName, config, client),
        30_000,
      );
    }

    if (config.docCases) {
      for (const doc of config.docCases) {
        const docTest = async () => {
          const preamble =
            doc.preamble ??
            (config.module ? `load ${config.module}` : config.preamble);
          const fullScript = preamble ? `${preamble}\n${doc.code}` : doc.code;
          const interpreter = createInterpreter(fullScript, client, {
            chainId: config.chainId,
          });
          await interpretDoc(interpreter);
        };
        if (doc.timeout !== undefined)
          it(`[DOC] ${doc.description}`, docTest, doc.timeout);
        else it(`[DOC] ${doc.description}`, docTest);
      }
    }

    if (config.errorCases) {
      for (const ec of config.errorCases) {
        it(ec.name, async () => {
          const fullScript = config.preamble
            ? `${config.preamble}\n${ec.script}`
            : ec.script;
          const interpreter = createInterpreter(fullScript, client, {
            chainId: config.chainId,
          });

          if (ec.declared) {
            await expectDeclaredFailure(
              () => interpreter.interpret(),
              ec.declared,
              commandName,
              typeof ec.error === "function" ? ec.error(interpreter) : ec.error,
            );
          } else if (typeof ec.error === "function") {
            const errorObj = ec.error(interpreter);
            await expectThrowAsync(() => interpreter.interpret(), errorObj);
          } else if (
            typeof ec.error === "string" ||
            ec.error instanceof RegExp
          ) {
            // Two-phase, as in `describeHelper`: catch first, assert after,
            // so the "did not throw" sentinel is never caught and matched
            // by the case's own matcher.
            const expected = ec.error;
            let thrown: unknown;
            let threw = false;
            try {
              await interpreter.interpret();
            } catch (err) {
              thrown = err;
              threw = true;
            }
            if (!threw) throw new Error("Expected command to throw");
            assertErrorMatches(thrown, expected);
          } else {
            await expectThrowAsync(() => interpreter.interpret(), ec.error);
          }
        });
      }
    }
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Strip an import list from a module spec ("lang [@map]" → "lang"). */
export function moduleBaseName(moduleSpec: string): string {
  return moduleSpec.split(/[\s[]/)[0];
}
