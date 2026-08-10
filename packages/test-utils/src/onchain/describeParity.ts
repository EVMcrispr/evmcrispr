import { describe, it } from "bun:test";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { expect } from "chai";
import type { Address, PublicClient } from "viem";

import { getPublicClient } from "../client";
import { type CompileEnv, compileExpression, runExpression } from "./compile";
import { type Norm, normalizeRun, sameValue, show } from "./decode";
import { installAssertionsCore } from "./install";
import { resolveValue } from "./resolve";

export interface ParityCase {
  name: string;
  /** Off-chain expression, interpreted at composition time. */
  run: string;
  /**
   * On-chain expression, compiled and then EXECUTED via `Assertions.resolve`.
   *
   * Spelled out rather than derived from `run` by adding `!`. Partial
   * derivation would be worse than none: it would also bang helpers that have
   * no on-chain face, and a nested case needs every level banged, which is an
   * AST rewrite rather than a string edit. It also could not express the cases
   * where the two faces genuinely take different arguments.
   */
  compile: string;
  /** ABI type of the resolved bytes when the category cannot say — in
   *  practice any array, e.g. `"address[]"`. */
  decodeAs?: string;
  /** Local helper name (no module prefix, no `!`) this case is about.
   *  Required with `diverges`, which is gated on its `compileDescription`. */
  helper?: string;

  /** The on-chain face legitimately refuses to compile this input. */
  refuses?: string | RegExp;
  /** It compiles, then reverts when resolved. */
  reverts?: string | RegExp;
  /** The off-chain face throws where the on-chain one succeeds. */
  runThrows?: string | RegExp;
  /** A declared, intentional difference. Fails if the faces AGREE. */
  diverges?: { reason: string; expect?: (run: Norm, chain: Norm) => void };

  timeout?: number;
}

export interface ParityConfig extends CompileEnv {
  cases: ParityCase[];
  describeName?: string;
  skip?: boolean;
  /** Client for the fork. Defaults to the shared gnosis anvil. */
  client?: PublicClient;
  /**
   * The module's generated helper registry (`import { helpers } from
   * "../../../src/_generated"`), used to check the `compileDescription`
   * ledger. Passed in rather than read off the loaded Module because a
   * Module's helper entries are lazy wrappers whose description only appears
   * after the helper is loaded. Same convention `describeHelper` uses for
   * `argDefs`. Required by any case declaring `diverges`.
   */
  helpers?: Record<string, { description?: string } | undefined>;
  /** Runs before each case, after the core is installed. For suites that need
   *  a mock deployed (see `installConstantMock`). Must be idempotent: it runs
   *  per case, because anvil_reset between packages discards any install. */
  setup?: (client: PublicClient) => Promise<void> | void;
}

interface Attempt<T> {
  value?: T;
  error?: Error;
}

async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: error as Error };
  }
}

function expectMessage(
  err: Error | undefined,
  want: string | RegExp,
  what: string,
) {
  expect(err, `expected ${what}, but it succeeded`).to.be.an("Error");
  const message = err!.message;
  if (typeof want === "string") {
    expect(message, `${what} message mismatch`).to.include(want);
  } else {
    expect(
      want.test(message),
      `${what} message ${JSON.stringify(message)} does not match ${want}`,
    ).to.be.true;
  }
}

/** Whether the helper's `!` face carries a `compileDescription`. The codegen
 *  merges it into the `name!` entry's description, so a difference between the
 *  two entries IS the declaration. */
function hasCompileDescription(
  helpers: Record<string, { description?: string } | undefined>,
  name: string,
): boolean {
  const plain = helpers[name]?.description;
  const bang = helpers[`${name}!`]?.description;
  return Boolean(bang && bang !== plain);
}

/**
 * Run each case through BOTH faces and compare the values.
 *
 * Parity is the default and divergence is the exception, but divergence is
 * often correct — on-chain reverts where off-chain clamps, strings are bytes
 * on-chain and UTF-16 off-chain. So the harness does not try to force the two
 * together; it turns UNDECLARED divergence into a failure.
 *
 * Three rules make that stick:
 *  - an undeclared compile throw FAILS rather than skipping, because a silent
 *    skip is how a suite ends up green and empty after a refactor;
 *  - `diverges` fails when the faces agree, so an exemption that has become
 *    false has to be deleted rather than quietly outliving its reason;
 *  - `diverges` is only allowed for a helper carrying a `compileDescription`,
 *    which makes that doc field the ledger instead of decoration.
 */
export function describeParity(label: string, config: ParityConfig): void {
  const runner = config.skip ? describe.skip : describe;

  runner(config.describeName ?? `${label} > parity`, () => {
    const client = config.client ?? getPublicClient();

    for (const c of config.cases) {
      const body = async () => {
        // Installed per test, not in beforeAll: bun caps hooks at 5s whatever
        // the test timeout, and anvil_reset between packages discards the
        // install anyway. Two local eth_getCode calls are the whole cost.
        const { core, operators } = await installAssertionsCore(client);
        await config.setup?.(client);
        const env = { ...config, core, operators };

        const compiled = await attempt(() => compileExpression(c.compile, env));

        if (c.refuses) {
          return expectMessage(
            compiled.error,
            c.refuses,
            `@${c.helper ?? "helper"}! to refuse`,
          );
        }
        if (compiled.error) {
          compiled.error.message =
            `the on-chain face failed to compile \`${c.compile}\`. ` +
            `If that is correct, declare it with \`refuses\`.\n  ${compiled.error.message}`;
          throw compiled.error;
        }

        const onchain = await attempt(() =>
          resolveValue(client, compiled.value!.operand as Operand, {
            core: core as Address,
            decodeAs: c.decodeAs,
          }),
        );
        if (c.reverts) {
          return expectMessage(
            onchain.error,
            c.reverts,
            `\`${c.compile}\` to revert`,
          );
        }
        if (onchain.error) {
          onchain.error.message = `resolve() failed for \`${c.compile}\`\n  ${onchain.error.message}`;
          throw onchain.error;
        }

        const offchain = await attempt(async () =>
          normalizeRun(await runExpression(c.run, config)),
        );
        if (c.runThrows) {
          return expectMessage(
            offchain.error,
            c.runThrows,
            `\`${c.run}\` to throw`,
          );
        }
        if (offchain.error) {
          offchain.error.message = `the off-chain face failed for \`${c.run}\`\n  ${offchain.error.message}`;
          throw offchain.error;
        }

        const off = offchain.value!;
        const on = onchain.value!;

        if (c.diverges) {
          if (!c.helper) {
            throw new Error(
              "a `diverges` case must name the `helper` it is about, so the " +
                "compileDescription ledger can be checked",
            );
          }
          if (!config.helpers) {
            throw new Error(
              "a `diverges` case needs the module's generated `helpers` map " +
                "in the suite config, so the compileDescription ledger can be " +
                'checked: import { helpers } from "../../../src/_generated"',
            );
          }
          expect(
            hasCompileDescription(config.helpers, c.helper),
            `@${c.helper} declares a divergence but has no compileDescription. ` +
              `Either make the faces agree, or write the sentence that says how ` +
              `the on-chain face differs.`,
          ).to.be.true;

          expect(
            sameValue(off, on),
            `declared divergence "${c.diverges.reason}" no longer holds — the ` +
              `faces now agree on ${show(on)}. Delete the exemption.`,
          ).to.be.false;
          c.diverges.expect?.(off, on);
          return;
        }

        expect(
          sameValue(off, on),
          `parity mismatch\n` +
            `  run     ${c.run}\n          -> ${show(off)}\n` +
            `  compile ${c.compile}\n          -> ${show(on)}\n`,
        ).to.be.true;
      };

      if (c.timeout !== undefined) it(c.name, body, c.timeout);
      else it(c.name, body, 30_000);
    }
  });
}
