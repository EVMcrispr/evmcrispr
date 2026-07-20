import { beforeAll, describe, it } from "bun:test";
import type { Action, ErrorException } from "@evmcrispr/sdk";
import { expect } from "chai";
import type { PublicClient } from "viem";
import { getPublicClient } from "../../client";
import { createInterpreter, type TestInterpreter } from "../evml";
import { expectThrowAsync } from "../expects";
import type { DocExample } from "./describeHelper";

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
  error:
    | string
    | RegExp
    | ErrorException
    | ((interpreter: TestInterpreter) => ErrorException);
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
  /** Error test cases. */
  errorCases?: CommandErrorCase[];
  /** Documentation examples — tested as runnable scripts and included in generated docs. */
  docCases?: DocExample[];
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
          const interpreter = createInterpreter(fullScript, client);
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

    if (config.docCases) {
      for (const doc of config.docCases) {
        it(`[DOC] ${doc.description}`, async () => {
          const preamble =
            doc.preamble ??
            (config.module ? `load ${config.module}` : config.preamble);
          const fullScript = preamble ? `${preamble}\n${doc.code}` : doc.code;
          const interpreter = createInterpreter(fullScript, client);
          await interpreter.interpret();
        });
      }
    }

    if (config.errorCases) {
      for (const ec of config.errorCases) {
        it(ec.name, async () => {
          const fullScript = config.preamble
            ? `${config.preamble}\n${ec.script}`
            : ec.script;
          const interpreter = createInterpreter(fullScript, client);

          if (typeof ec.error === "function") {
            const errorObj = ec.error(interpreter);
            await expectThrowAsync(() => interpreter.interpret(), errorObj);
          } else if (typeof ec.error === "string") {
            try {
              await interpreter.interpret();
              throw new Error("Expected command to throw");
            } catch (err: any) {
              expect(err.message).to.include(ec.error);
            }
          } else if (ec.error instanceof RegExp) {
            try {
              await interpreter.interpret();
              throw new Error("Expected command to throw");
            } catch (err: any) {
              expect(err.message).to.match(ec.error);
            }
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
