import { describe, expect, it } from "bun:test";
import { DeclaredError } from "../../src/errors";
import type { Module } from "../../src/Module";
import type { Operand } from "../../src/onchain/types";
import type {
  CommandExpressionNode,
  HelperFunctionNode,
  NodesInterpreters,
} from "../../src/types";
import { defineErrors } from "../../src/utils/declaredErrors";
import { defineCommand } from "../../src/utils/defineCommand";
import { defineHelper } from "../../src/utils/defineHelper";

const interpreters: NodesInterpreters = {
  interpretNode: async (n: any) => n?.value,
  interpretNodes: async (ns: any[]) => ns.map((n) => n?.value),
};

const module = { types: {} } as unknown as Module;

const cmdNode = () =>
  ({ name: "x", args: [], opts: [] }) as unknown as CommandExpressionNode;

const helperNode = (name: string) =>
  ({ name, args: [] }) as unknown as HelperFunctionNode;

const ERRORS = defineErrors({
  NoBalance: { description: "The funder holds none of the sell token" },
  BelowMinimum: {
    description: "A part is below the network minimum",
    fields: [{ name: "minimum", type: "number" }],
  },
});

const caught = async (run: () => Promise<unknown>): Promise<any> => {
  try {
    await run();
  } catch (err) {
    return err;
  }
  throw new Error("expected a failure");
};

describe("defineCommand declared errors", () => {
  it("rejects inline invalid metadata at definition time", () => {
    expect(() =>
      defineCommand({
        name: "twap",
        args: [],
        errors: { lowercase: { description: "nope" } },
        run: async () => [],
      }),
    ).toThrow(/command "twap".*lowercase/s);

    expect(() =>
      defineCommand({
        name: "twap",
        args: [],
        errors: { BadField: { description: "x", fields: [{ name: "a" }] } },
        run: async () => [],
      } as any),
    ).toThrow(/command "twap"/);
  });

  it("exposes normalized, deeply frozen metadata", () => {
    const cmd = defineCommand({
      name: "twap",
      args: [],
      errors: { ...ERRORS },
      run: async () => [],
    });

    expect(cmd.errors).toEqual({
      NoBalance: {
        description: "The funder holds none of the sell token",
        fields: [],
      },
      BelowMinimum: {
        description: "A part is below the network minimum",
        fields: [{ name: "minimum", type: "number" }],
      },
    });
    const errors = cmd.errors as any;
    expect(Object.isFrozen(errors)).toBe(true);
    expect(() => {
      errors.Extra = { description: "x", fields: [] };
    }).toThrow();
    expect(() => {
      errors.NoBalance.description = "changed";
    }).toThrow();
    expect(() => {
      errors.BelowMinimum.fields.push({ name: "b", type: "bool" });
    }).toThrow();
    expect(() => {
      errors.BelowMinimum.fields[0].name = "other";
    }).toThrow();
  });

  it("exposes an empty frozen block when nothing is declared", () => {
    const cmd = defineCommand({ name: "plain", args: [], run: async () => [] });
    expect(cmd.errors).toEqual({});
    expect(Object.isFrozen(cmd.errors)).toBe(true);
  });

  it("passes a typed fail to the run context", async () => {
    const cmd = defineCommand<Module, typeof ERRORS>({
      name: "twap",
      args: [],
      errors: ERRORS,
      async run(_module, _args, { fail }) {
        fail("BelowMinimum", { minimum: 500n }, "a part is below $5");
      },
    });

    const err = await caught(() => cmd.run(module, cmdNode(), interpreters));
    expect(err).toBeInstanceOf(DeclaredError);
    expect(err.errorName).toBe("BelowMinimum");
    expect(err.message).toBe("a part is below $5");
    expect(err.fields).toEqual({ minimum: 500n });
    expect(err.revertData).toMatch(/^0x[0-9a-f]{72}$/);
  });

  it("keeps the rest of the run context", async () => {
    const seen: Record<string, unknown> = {};
    const cmd = defineCommand({
      name: "ctx",
      args: [],
      opts: [{ name: "flag", type: "string" }],
      errors: ERRORS,
      async run(_module, _args, context) {
        Object.assign(seen, {
          opts: context.opts,
          node: context.node,
          interpreters: context.interpreters,
          fail: typeof context.fail,
        });
        return [];
      },
    });

    const node = cmdNode();
    await cmd.run(module, node, interpreters);
    expect(seen.opts).toEqual({});
    expect(seen.node).toBe(node);
    expect(seen.interpreters).toBe(interpreters);
    expect(seen.fail).toBe("function");
  });

  it("refuses an unknown name from an untyped caller", async () => {
    const cmd = defineCommand({
      name: "twap",
      args: [],
      errors: ERRORS,
      async run(_module, _args, context) {
        (context.fail as any)("Nope", "not declared");
        return [];
      },
    });
    await expect(cmd.run(module, cmdNode(), interpreters)).rejects.toThrow(
      /command "twap": unknown declared error "Nope"/,
    );
  });

  it("refuses every name when the command declares no errors", async () => {
    const cmd = defineCommand({
      name: "plain",
      args: [],
      async run(_module, _args, context) {
        (context.fail as any)("Anything", "nope");
        return [];
      },
    });
    await expect(cmd.run(module, cmdNode(), interpreters)).rejects.toThrow(
      /command "plain": cannot raise "Anything": this definition declares no errors/,
    );
  });
});

describe("defineHelper declared errors", () => {
  it("rejects inline invalid metadata at definition time", () => {
    expect(() =>
      defineHelper({
        name: "holdings",
        args: [],
        errors: { Error: { description: "reserved" } },
        run: async () => "ok",
      }),
    ).toThrow(/helper "@holdings".*Error/s);
  });

  it("exposes normalized, deeply frozen metadata", () => {
    const fn = defineHelper({
      name: "holdings",
      args: [],
      errors: { ...ERRORS },
      run: async () => "ok",
    });

    expect(fn.errors).toEqual({
      NoBalance: {
        description: "The funder holds none of the sell token",
        fields: [],
      },
      BelowMinimum: {
        description: "A part is below the network minimum",
        fields: [{ name: "minimum", type: "number" }],
      },
    });
    const errors = fn.errors as any;
    expect(Object.isFrozen(errors)).toBe(true);
    expect(() => {
      errors.Extra = { description: "x", fields: [] };
    }).toThrow();
    expect(() => {
      errors.NoBalance.description = "changed";
    }).toThrow();
    expect(() => {
      errors.BelowMinimum.fields.push({ name: "b", type: "bool" });
    }).toThrow();
  });

  it("exposes an empty frozen block when nothing is declared", () => {
    const fn = defineHelper({ name: "plain", args: [], run: async () => "ok" });
    expect(fn.errors).toEqual({});
    expect(Object.isFrozen(fn.errors)).toBe(true);
  });

  it("passes a typed fail to the run face", async () => {
    const fn = defineHelper<Module, typeof ERRORS>({
      name: "holdings",
      args: [],
      errors: ERRORS,
      async run(_module, _args, { fail }) {
        return fail("NoBalance", "the funder holds no DAI");
      },
    });

    const err = await caught(() =>
      fn(module, helperNode("holdings"), interpreters),
    );
    expect(err).toBeInstanceOf(DeclaredError);
    expect(err.errorName).toBe("NoBalance");
    expect(err.message).toBe("the funder holds no DAI");
    expect(err.fields).toEqual({});
  });

  it("keeps the rest of the run context", async () => {
    const seen: Record<string, unknown> = {};
    const fn = defineHelper({
      name: "ctx",
      args: [],
      errors: ERRORS,
      async run(_module, _args, context) {
        Object.assign(seen, {
          node: context.node,
          interpreters: context.interpreters,
          fail: typeof context.fail,
        });
        return "ok";
      },
    });

    const node = helperNode("ctx");
    expect(await fn(module, node, interpreters)).toBe("ok");
    expect(seen.node).toBe(node);
    expect(seen.interpreters).toBe(interpreters);
    expect(seen.fail).toBe("function");
  });

  it("gives a compile-only helper no fail channel", () => {
    const compile = async (...args: unknown[]) =>
      ({ kind: "const", cat: "Uint", value: String(args.length) }) as Operand;
    const fn = defineHelper({
      name: "onchainonly",
      args: [],
      errors: ERRORS,
      compile: compile as any,
    });

    // The declared metadata is still exposed, but the on-chain face travels
    // to the compilers untouched: no context, and therefore no `fail`.
    expect(Object.keys(fn.errors ?? {})).toEqual(["NoBalance", "BelowMinimum"]);
    expect((fn as any).compile).toBe(compile);
  });

  it("refuses every name when the helper declares no errors", async () => {
    const fn = defineHelper({
      name: "plain",
      args: [],
      async run(_module, _args, context) {
        return (context.fail as any)("Anything", "nope");
      },
    });
    await expect(fn(module, helperNode("plain"), interpreters)).rejects.toThrow(
      /helper "@plain": cannot raise "Anything": this definition declares no errors/,
    );
  });
});
