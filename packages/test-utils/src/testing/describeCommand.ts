import { beforeAll, describe, it } from "bun:test";
import type { Action, ErrorException } from "@evmcrispr/sdk";
import { expect } from "chai";
import type { PublicClient } from "viem";
import { getPublicClient } from "../client";
import { createInterpreter, type TestInterpreter } from "../evml";
import { expectThrowAsync } from "../expects";

export interface CommandTestCase {
  name: string;
  script: string;
  expectedActions?: Action[];
  validate?: (
    result: Action[],
    interpreter: TestInterpreter,
  ) => void | Promise<void>;
}

export interface CommandErrorCase {
  name: string;
  script: string;
  error: string | RegExp | ErrorException;
}

export interface CommandTestConfig {
  /** Module to load (e.g. "giveth"). Omit for std commands (auto-loaded). */
  module?: string;
  /** Script preamble prepended to every test case (e.g. "load aragonos --as ar"). */
  preamble?: string;
  /** Happy-path test cases. */
  cases?: CommandTestCase[];
  /** Error test cases. */
  errorCases?: CommandErrorCase[];
  /** Custom describe name override. */
  describeName?: string;
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
    `${config.module ? `${capitalize(config.module)} >` : "Std >"} commands > ${commandName}`;

  describe(label, () => {
    let client: PublicClient;

    beforeAll(() => {
      client = getPublicClient();
    });

    if (config.cases) {
      for (const c of config.cases) {
        it(c.name, async () => {
          const fullScript = config.preamble
            ? `${config.preamble}\n${c.script}`
            : c.script;
          const interpreter = createInterpreter(fullScript, client);
          const actions = await interpreter.interpret();

          if (c.expectedActions) {
            expect(actions).to.eql(c.expectedActions);
          }
          if (c.validate) {
            await c.validate(actions, interpreter);
          }
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

          if (typeof ec.error === "string") {
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
