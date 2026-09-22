/**
 * Compile-time tests for the declared-error generics of `defineCommand` and
 * `defineHelper`. There is nothing to run: `tsc -p tsconfig.json` (the SDK's
 * `type-check` script, whose `include` covers `test`) is the assertion. Every
 * `@ts-expect-error` below fails the build if the line starts compiling.
 */
import type { Module } from "../../src/Module";
import type { Commands, HelperFunctions } from "../../src/types";
import { defineErrors } from "../../src/utils/declaredErrors";
import { defineCommand } from "../../src/utils/defineCommand";
import { defineHelper } from "../../src/utils/defineHelper";

export const TWAP_ERRORS = defineErrors({
  SameToken: { description: "The sell and buy token are the same" },
  BelowMinimum: {
    description: "A part is below the network minimum",
    fields: [
      { name: "minimum", type: "number" },
      { name: "token", type: "address" },
    ],
  },
});

/** The real call shape: the module type explicit, the schema explicit. */
export const twap = defineCommand<Module, typeof TWAP_ERRORS>({
  name: "twap",
  description: "Sell a token in parts",
  args: [],
  opts: [],
  errors: TWAP_ERRORS,
  async run(_module, _args, { opts, fail }) {
    void opts;
    // Fieldless name, two-argument form.
    if (Math.random() > 1) fail("SameToken", "the tokens are the same");
    // Fieldless name, explicit empty field map.
    if (Math.random() > 1) fail("SameToken", {}, "the tokens are the same");
    // Every declared field, exact types.
    if (Math.random() > 1)
      fail(
        "BelowMinimum",
        { minimum: 5n, token: "0xdeadbeef" },
        "a part is below the minimum",
      );
    // A `number` field also accepts a safe JS integer.
    if (Math.random() > 1)
      fail("BelowMinimum", { minimum: 5, token: "0xdeadbeef" }, "below");

    // @ts-expect-error unknown declared error name
    if (Math.random() > 1) fail("Nope", "not declared");
    // @ts-expect-error missing the `token` field
    if (Math.random() > 1) fail("BelowMinimum", { minimum: 5n }, "below");
    if (Math.random() > 1)
      fail(
        "BelowMinimum",
        // @ts-expect-error wrong field type
        { minimum: "5", token: "0xdead" },
        "below",
      );
    if (Math.random() > 1)
      fail(
        "BelowMinimum",
        // @ts-expect-error extra field not declared
        { minimum: 5n, token: "0xdead", extra: true },
        "below",
      );
    // @ts-expect-error the two-argument form is fieldless names only
    if (Math.random() > 1) fail("BelowMinimum", "below");
    return [];
  },
});

/** A schema-less definition has no valid failure names. */
export const plain = defineCommand<Module>({
  name: "plain",
  args: [],
  async run(_module, _args, { fail }) {
    // @ts-expect-error nothing is declared, so no name can be raised
    if (Math.random() > 1) fail("Anything", "nope");
    return [];
  },
});

/** Inline declaration: both generics inferred, literal names preserved. */
export const inline = defineCommand({
  name: "inline",
  args: [],
  errors: {
    NoBalance: { description: "The funder holds none of the sell token" },
    Dust: {
      description: "The remainder is dust",
      fields: [{ name: "left", type: "number" }],
    },
  },
  async run(_module, _args, { fail }) {
    if (Math.random() > 1) fail("NoBalance", "no balance");
    if (Math.random() > 1) fail("Dust", { left: 1n }, "dust left");
    // @ts-expect-error not declared inline
    if (Math.random() > 1) fail("SameToken", "the tokens are the same");
    // @ts-expect-error `left` is a number field, not a string
    if (Math.random() > 1) fail("Dust", { left: "1" }, "dust left");
    return [];
  },
});

/** Spread declaration: the shared names come through inference too. */
export const spread = defineCommand({
  name: "spread",
  args: [],
  errors: { ...TWAP_ERRORS, Extra: { description: "Something else" } },
  async run(_module, _args, { fail }) {
    if (Math.random() > 1) fail("SameToken", "same token");
    if (Math.random() > 1) fail("Extra", "something else");
    if (Math.random() > 1)
      fail("BelowMinimum", { minimum: 1n, token: "0xdead" }, "below");
    // @ts-expect-error still not a declared name
    if (Math.random() > 1) fail("Nope", "nope");
    return [];
  },
});

export const HOLDINGS_ERRORS = defineErrors({
  NoExplorer: {
    description: "The chain has no supported explorer",
    fields: [{ name: "chain", type: "number" }],
  },
  Unsupported: { description: "The account type is not supported" },
});

/** The real helper call shape. */
export const holdings = defineHelper<Module, typeof HOLDINGS_ERRORS>({
  name: "holdings",
  description: "List an account's token holdings",
  returnType: "array",
  args: [],
  errors: HOLDINGS_ERRORS,
  async run(_module, _args, { fail }) {
    if (Math.random() > 1) fail("Unsupported", "not supported");
    if (Math.random() > 1) fail("NoExplorer", { chain: 100n }, "no explorer");
    // @ts-expect-error unknown declared error name
    if (Math.random() > 1) fail("Nope", "not declared");
    // @ts-expect-error `NoExplorer` declares a field
    if (Math.random() > 1) fail("NoExplorer", "no explorer");
    // @ts-expect-error wrong field type
    if (Math.random() > 1) fail("NoExplorer", { chain: "100" }, "no explorer");
    if (Math.random() > 1)
      fail(
        "NoExplorer",
        // @ts-expect-error extra field not declared
        { chain: 100n, extra: 1n },
        "no explorer",
      );
    return [];
  },
});

/** A schema-less helper, and an inline one inferring both generics. */
export const plainHelper = defineHelper<Module>({
  name: "plainHelper",
  args: [],
  async run(_module, _args, { fail }) {
    // @ts-expect-error nothing is declared, so no name can be raised
    if (Math.random() > 1) fail("Anything", "nope");
    return "ok";
  },
});

export const inlineHelper = defineHelper({
  name: "inlineHelper",
  args: [],
  errors: { Nothing: { description: "Nothing to return" } },
  async run(_module, _args, { fail }) {
    if (Math.random() > 1) fail("Nothing", "nothing to return");
    // @ts-expect-error not declared inline
    if (Math.random() > 1) fail("NoExplorer", "no explorer");
    return "ok";
  },
});

/** A compile face gets no `fail`: its context is the on-chain compile ctx. */
export const compileOnly = defineHelper<Module, typeof HOLDINGS_ERRORS>({
  name: "compileOnly",
  args: [],
  errors: HOLDINGS_ERRORS,
  async compile(ctx, _node) {
    // @ts-expect-error the on-chain face has no catchable failure channel
    void ctx.fail;
    return { kind: "const", cat: "Uint", value: "1" };
  },
});

/** Erased storage: a registry accepts definitions with any schema. */
export const commands: Commands<Module> = {
  twap,
  plain,
  inline,
  spread,
};

export const helpers: HelperFunctions<Module> = {
  holdings,
  plainHelper,
  inlineHelper,
  compileOnly,
};
