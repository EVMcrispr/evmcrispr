import { beforeEach, describe, expect, it } from "bun:test";
import "../../setup.js";

import type {
  Action,
  BlockExpressionNode,
  CommandExpressionNode,
  Module,
} from "@evmcrispr/sdk";
import {
  abiBindingKey,
  BindingsSpace,
  CommandError,
  DeclaredError,
  defineCommand,
  defineErrors,
  defineHelper,
  defineModule,
  HelperFunctionError,
  RevertError,
} from "@evmcrispr/sdk";
import { custom, encodeErrorResult, parseAbi } from "viem";
import { collectLineDeclaredErrors } from "../../../src/errors/declarations";
import { createEvml } from "../../../src/evml/tag";
import { runtimeDeclarationLookup } from "../../../src/interpreter/declarations";
import { Interpreter } from "../../../src/interpreter/Interpreter";
import { parseScript } from "../../../src/parsers/script";

// Declared errors travel from a command's or a helper's `fail` to the
// containing command line's `-?!>` / `-!>` captures. These tests pin how
// the interpreter gathers the declarations a line can see, which failures
// it lets through to the resolver, and what a successful line means for
// each capture form — in execution mode and inside collecting blocks.

const ACCOUNT = "0x000000000000000000000000000000000000dEaD";
const TARGET_A = "0x1111111111111111111111111111111111111111";
const TARGET_B = "0x2222222222222222222222222222222222222222";

const COMMAND_ERRORS = defineErrors({
  Refused: {
    description: "The command refused the given reason",
    fields: [{ name: "reason", type: "string" }],
  },
  Shared: {
    description: "Declared by the command with a code",
    fields: [{ name: "code", type: "number" }],
  },
  Same: { description: "Declared identically by the command and a helper" },
});

const SEND_ERRORS = defineErrors({
  Bounced: {
    description: "The transaction bounced",
    fields: [{ name: "code", type: "number" }],
  },
});

const FAILURE = defineErrors({
  Failure: {
    description: "The helper refused",
    fields: [
      { name: "first", type: "number" },
      { name: "second", type: "number" },
    ],
  },
});

const HELPER_SHARED = defineErrors({
  Shared: { description: "Declared by a helper without fields" },
});

/** Command-body invocations and helper invocations, reset per test. */
const calls = { refuse: 0, shared: 0 };

const refuse = defineCommand<Module, typeof COMMAND_ERRORS>({
  name: "refuse",
  description: "refuses with a declared error unless the reason is ok",
  args: [{ name: "reason", type: "string", description: "why" }],
  opts: [{ name: "note", type: "any", description: "evaluated, unused" }],
  errors: COMMAND_ERRORS,
  async run(_module, { reason }, { fail }) {
    calls.refuse += 1;
    if (reason === "ok") return [];
    if (reason === "shared") fail("Shared", { code: 7n }, "shared by command");
    if (reason === "same") fail("Same", "same by command");
    fail("Refused", { reason }, `refused: ${reason}`);
  },
});

const send = defineCommand<Module, typeof SEND_ERRORS>({
  name: "send",
  description: "two empty transactions",
  args: [
    { name: "first", type: "address", description: "first target" },
    { name: "second", type: "address", description: "second target" },
  ],
  errors: SEND_ERRORS,
  async run(_module, { first, second }) {
    return [
      { to: first, data: "0x", value: 0n },
      { to: second, data: "0x", value: 0n },
    ];
  },
});

// Runs its block in execution mode (like `if`), returning its actions.
const wrap = defineCommand({
  name: "wrap",
  description: "runs a block",
  args: [{ name: "block", type: "block", description: "body" }],
  async run(_module, { block }, { interpreters }) {
    return (await interpreters.interpretNode(block as BlockExpressionNode, {
      actionCallback: interpreters.actionCallback,
    })) as Action[];
  },
});

// Runs its block as a collecting context (like `safe:execute`): inner
// commands get no action callback and the collected actions are consumed.
const collect = defineCommand({
  name: "collect",
  description: "collects a block",
  args: [{ name: "block", type: "block", description: "body" }],
  async run(_module, { block }, { interpreters }) {
    await interpreters.interpretNode(block as BlockExpressionNode);
    return [];
  },
});

const gonnaFail = defineHelper<Module, typeof FAILURE>({
  name: "gonnaFail",
  args: [],
  errors: FAILURE,
  async run(_module, _args, { fail }) {
    fail("Failure", { first: 1n, second: 2n }, "the helper refused");
  },
});

const id = defineHelper({
  name: "id",
  args: [{ name: "value", type: "any", description: "returned as is" }],
  async run(_module, { value }) {
    return value;
  },
});

const shared = defineHelper<Module, typeof HELPER_SHARED>({
  name: "shared",
  args: [{ name: "refuse", type: "bool", description: "whether to fail" }],
  errors: HELPER_SHARED,
  async run(_module, { refuse }, { fail }) {
    calls.shared += 1;
    if (refuse) fail("Shared", "shared by helper");
    return "ok";
  },
});

const same = defineHelper({
  name: "same",
  args: [],
  errors: { Same: { description: "Declared identically by a helper" } },
  async run(_module, _args, { fail }) {
    fail("Same", "same by helper");
  },
});

const boom = defineHelper({
  name: "boom",
  args: [],
  async run() {
    throw new Error("kaboom");
  },
});

// Same name as std's `@me`: unqualified `@me` must keep resolving to std.
const me = defineHelper<Module, typeof HELPER_SHARED>({
  name: "me",
  args: [],
  errors: HELPER_SHARED,
  async run() {
    return "module me";
  },
});

// Same name as the module constant below: `@answer` (no args) is the
// constant, `@answer(1)` the helper.
const answer = defineHelper<Module, typeof HELPER_SHARED>({
  name: "answer",
  args: [{ name: "n", type: "number", description: "ignored" }],
  errors: HELPER_SHARED,
  async run() {
    return "helper answer";
  },
});

// On-chain-only face: declares an error, but has no `run` to raise it.
const onchain = defineHelper<Module, typeof HELPER_SHARED>({
  name: "onchain",
  args: [],
  errors: HELPER_SHARED,
  async compile() {
    throw new Error("never compiled here");
  },
});

const load = <T>(value: T) => ({ load: async () => ({ default: value }) });

const Declared = defineModule(
  "declared",
  {
    refuse: load(refuse),
    send: load(send),
    wrap: load(wrap),
    collect: load(collect),
  },
  {
    gonnaFail: load(gonnaFail),
    id: load(id),
    shared: load(shared),
    same: load(same),
    boom: load(boom),
    me: load(me),
    answer: load(answer),
    "onchain!": { ...load(onchain), onchain: true },
  },
  {},
  { answer: "42" },
);

const fakeTransport = custom({
  request: async ({ method }: { method: string }) => {
    if (method === "eth_chainId") return "0x1";
    throw new Error(`unexpected RPC call: ${method}`);
  },
});

const evml = createEvml({ account: ACCOUNT, transports: { 1: fakeTransport } });
evml.use(Declared);

const BOUNCED_ABI = parseAbi(["error Bounced(uint256 code)"]);
const CUSTOM_ABI = parseAbi(["error Custom(uint256 code)"]);

type Callback = (action: Action) => Promise<unknown>;

const session = (callback: Callback | undefined | "record" = "record") => {
  const interpreter = new Interpreter(evml.registry, evml.config);
  const seen: Action[] = [];
  const actionCallback: Callback | undefined =
    callback === "record"
      ? async (action) => {
          seen.push(action);
          return undefined;
        }
      : callback;
  return {
    interpreter,
    seen,
    binding: (name: string) =>
      interpreter.bindingsManager.getBindingValue(name, BindingsSpace.USER),
    text: (name: string) => {
      const value = interpreter.bindingsManager.getBindingValue(
        name,
        BindingsSpace.USER,
      );
      return value === undefined ? undefined : String(value);
    },
    exec: (script: string) =>
      interpreter.interpret(`load declared\n${script}`, actionCallback),
  };
};

const run = async (script: string, callback?: Callback | "record") => {
  const s = session(callback);
  const returned = await s.exec(script);
  return { ...s, returned };
};

const thrownBy = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("expected the script to fail");
};

beforeEach(() => {
  calls.refuse = 0;
  calls.shared = 0;
});

describe("Interpreter - declared errors", () => {
  describe("helper refusals on the containing line", () => {
    it("a bare optional capture accepts a direct helper refusal and sends nothing", async () => {
      const { text, seen, returned } = await run(
        "set $x @declared:gonnaFail -?!> Failure $f",
      );
      expect(text("$f")).toBe("true");
      expect(text("$x")).toBeUndefined();
      expect(seen.length).toBe(0);
      expect(returned.length).toBe(0);
    });

    const reachable: [string, string][] = [
      ["nested helper call", "set $x @declared:id(@declared:gonnaFail)"],
      ["array element", "set $x [1 @declared:gonnaFail]"],
      [
        "named helper argument",
        "set $x @declared:id(value:@declared:gonnaFail)",
      ],
      ["option value", 'declared:refuse "ok" --note @declared:gonnaFail'],
      [
        "call expression argument",
        `set $x ${TARGET_A}::{foo(uint256)(uint256) @declared:gonnaFail}`,
      ],
    ];
    for (const [where, line] of reachable) {
      it(`finds the helper's declaration in a ${where}`, async () => {
        const { text } = await run(`${line} -?!> Failure [$a $b]`);
        expect(text("$a")).toBe("1");
        expect(text("$b")).toBe("2");
      });
    }

    it("a bare, an inline and a generic -!> each accept the refusal", async () => {
      const bare = await run("set $x @declared:gonnaFail -!> Failure $f");
      expect(bare.text("$f")).toBe("true");

      const inline = await run(
        "set $x @declared:gonnaFail -!> Failure(uint256,uint256) [$a $b]",
      );
      expect(inline.text("$a")).toBe("1");
      expect(inline.text("$b")).toBe("2");

      const flag = await run("set $x @declared:gonnaFail -!> $e");
      expect(flag.text("$e")).toBe("true");

      const message = await run("set $x @declared:gonnaFail -!> [$msg]");
      expect(message.text("$msg")).toBe("the helper refused");
    });

    it("a mixed list accepts whichever side fails", async () => {
      const helper = await run(
        'declared:refuse "x" --note @declared:gonnaFail -?!> Failure $f -!> Refused $r',
      );
      expect(helper.text("$f")).toBe("true");
      expect(helper.text("$r")).toBe("false");
      expect(calls.refuse).toBe(0);

      const command = await run(
        'declared:refuse "x" --note @declared:id(1) -?!> Failure $f -!> Refused $r',
      );
      expect(command.text("$f")).toBe("false");
      expect(command.text("$r")).toBe("true");
      expect(calls.refuse).toBe(1);
    });

    it("a helper signature identical to the command's is one declared error", async () => {
      const helper = await run(
        'declared:refuse "x" --note @declared:same -?!> Same $s',
      );
      expect(helper.text("$s")).toBe("true");
      expect(calls.refuse).toBe(0);

      const command = await run('declared:refuse "same" -?!> Same $s');
      expect(command.text("$s")).toBe("true");
    });

    it("a captured helper refusal skips the command body and keeps the target's binding", async () => {
      const { text } = await run(
        "set $x 5\nset $x @declared:gonnaFail -?!> Failure $f",
      );
      expect(text("$x")).toBe("5");
      expect(text("$f")).toBe("true");

      await run("declared:refuse @declared:gonnaFail -?!> Failure");
      expect(calls.refuse).toBe(0);
    });

    it("a capture may write an error field straight into the assignment target", async () => {
      const { text } = await run(
        "set $x 5\nset $x @declared:gonnaFail -!> Failure [_ $x]",
      );
      expect(text("$x")).toBe("2");
    });

    it("a successful helper followed by the command's own refusal satisfies -!>", async () => {
      const { text } = await run(
        'declared:refuse @declared:id("x") -!> Refused [$r]',
      );
      expect(text("$r")).toBe("x");
      expect(calls.refuse).toBe(1);
    });

    it("the script continues after a captured refusal", async () => {
      const { text, seen } = await run(
        `set $x @declared:gonnaFail -?!> Failure $f\nset $after 1\ndeclared:send ${TARGET_A} ${TARGET_B}`,
      );
      expect(text("$f")).toBe("true");
      expect(text("$after")).toBe("1");
      expect(seen.length).toBe(2);
    });
  });

  describe("successful lines", () => {
    for (const [mode, callback] of [
      ["with an action callback", "record"],
      ["without an action callback", undefined],
    ] as const) {
      it(`optional captures clear their flags on a zero-action success ${mode}`, async () => {
        const { text } = await run(
          "set $x @declared:id(1) -?!> Failure $f -?!> $e",
          callback,
        );
        expect(text("$f")).toBe("false");
        expect(text("$e")).toBe("false");
        expect(text("$x")).toBe("1");
      });

      it(`a required capture rejects a zero-action success ${mode}`, async () => {
        const { exec, text } = session(callback);
        await expect(
          exec("set $x @declared:id(1) -!> Failure"),
        ).rejects.toThrow(/expected .*fail.* but it succeeded/i);
        expect(text("$x")).toBe("1");
      });
    }

    it("a zero-action command refusal is captured and dispatches nothing", async () => {
      const refused = await run('declared:refuse "x" -?!> Refused [$r]');
      expect(refused.text("$r")).toBe("x");
      expect(refused.seen.length).toBe(0);

      const ok = await run('declared:refuse "ok" -?!> Refused $r');
      expect(ok.text("$r")).toBe("false");
      await expect(run('declared:refuse "ok" -!> Refused')).rejects.toThrow(
        /expected .*fail.* but it succeeded/i,
      );
    });
  });

  describe("uncaptured failures", () => {
    it("an unmatched named capture rethrows the helper wrapper with its cause", async () => {
      const { exec, text } = session();
      const thrown = await thrownBy(
        exec("set $x @declared:gonnaFail -?!> Refused $r"),
      );
      expect(thrown).toBeInstanceOf(HelperFunctionError);
      expect((thrown as Error).message).toMatch(
        /^@gonnaFail\(.*\): the helper refused/,
      );
      const cause = (thrown as Error).cause;
      expect(cause).toBeInstanceOf(DeclaredError);
      expect((cause as DeclaredError).errorName).toBe("Failure");
      expect(text("$r")).toBeUndefined();

      const required = await thrownBy(
        run("set $x @declared:gonnaFail -!> Refused"),
      );
      expect(required).toBeInstanceOf(HelperFunctionError);
      expect((required as Error).cause).toBeInstanceOf(DeclaredError);
    });

    it("an unknown bare name is a mismatch, not a capture error", async () => {
      const thrown = await thrownBy(
        run("set $x @declared:gonnaFail -?!> Nope $n"),
      );
      expect(thrown).toBeInstanceOf(HelperFunctionError);
      expect((thrown as Error).message).toMatch(/the helper refused/);
    });

    it("an unmatched command refusal keeps the command wrapper and cause", async () => {
      const thrown = await thrownBy(run('declared:refuse "x" -!> Failure'));
      expect(thrown).toBeInstanceOf(CommandError);
      expect((thrown as Error).message).toMatch(
        /^declared:refuse\(.*\): refused: x/,
      );
      expect((thrown as Error).cause).toBeInstanceOf(DeclaredError);
    });

    it("undeclared helper failures and script errors stay uncapturable", async () => {
      const undeclared = session();
      await expect(
        undeclared.exec("set $x @declared:boom -?!> $e"),
      ).rejects.toThrow(/kaboom/);
      expect(undeclared.text("$e")).toBeUndefined();

      const variable = session();
      await expect(
        variable.exec("set $x @declared:id($nope) -?!> $e"),
      ).rejects.toThrow(/\$nope not defined/);
      expect(variable.text("$e")).toBeUndefined();

      await expect(
        run("declared:refuse $nope -?!> Refused $r -?!> $e"),
      ).rejects.toThrow(/\$nope not defined/);
    });

    it("control-flow signals pass through untouched", async () => {
      const { text } = await run(
        "loop $i of [1 2 3] (\n  set $n $i\n  loop break -?!> $e\n)",
      );
      expect(text("$n")).toBe("1");
      expect(text("$e")).toBeUndefined();
    });
  });

  describe("resolution", () => {
    it("an imported helper contributes its declarations", async () => {
      const { interpreter, text } = session();
      await interpreter.interpret(
        "load declared [@gonnaFail]\nset $x @gonnaFail -?!> Failure $f",
      );
      expect(text("$f")).toBe("true");
    });

    it("a renamed import contributes its declarations", async () => {
      const { interpreter, text } = session();
      await interpreter.interpret(
        "load declared [@gonnaFail>@nope]\nset $x @nope -?!> Failure [$a $b]",
      );
      expect(text("$a")).toBe("1");
      expect(text("$b")).toBe("2");
    });

    it("an unqualified name resolves to std before a loaded module's helper", async () => {
      // Module `declared` also defines `@me`, declaring `Shared()` — a
      // different signature from the command's `Shared(uint256)`. Only if
      // `@me` wrongly resolved to the module would the bare name be
      // ambiguous.
      const std = await run(
        'declared:refuse "shared" --note @me -?!> Shared [$code]',
      );
      expect(std.text("$code")).toBe("7");

      const { interpreter } = session();
      await expect(
        interpreter.interpret(
          'load declared [@me]\ndeclared:refuse "shared" --note @me -?!> Shared [$code]',
        ),
      ).rejects.toThrow(/more than one signature/);
      expect(calls.refuse).toBe(1);
    });

    it("a local def shadows the module helper and declares nothing", async () => {
      const { interpreter, text } = session();
      await interpreter.interpret(
        'load declared [@gonnaFail]\ndef @mine "-> number" 1\nset $x @mine -?!> Failure $f',
      );
      expect(text("$f")).toBe("false");
      expect(text("$x")).toBe("1");

      const required = session();
      await expect(
        required.interpreter.interpret(
          'load declared\ndef @gonnaFail "-> number" 1\nset $x @gonnaFail -!> Failure',
        ),
      ).rejects.toThrow(/expected .*fail.* but it succeeded/i);
    });

    it("an on-chain-only face contributes no off-chain declarations", async () => {
      // `@declared:onchain!` declares `Shared()`; were it collected, the
      // bare capture would be ambiguous before the line ran. It is not, so
      // the line runs and fails where the on-chain face is evaluated.
      const { exec } = session();
      await expect(
        exec('declared:refuse "shared" --note @declared:onchain! -?!> Shared'),
      ).rejects.toThrow(/evaluates on-chain/);
      expect(calls.refuse).toBe(0);
    });

    it("the runtime lookup mirrors execution precedence", async () => {
      const { interpreter } = session();
      await interpreter.interpret(
        'load declared [@gonnaFail>@nope refuse]\ndef @me "-> string" "x"\ndef go "$a: string" (\n  set $y $a\n)',
      );
      const lookup = runtimeDeclarationLookup({
        bindings: interpreter.bindingsManager,
        std: () => interpreter.getModule("std")!,
        modules: () =>
          interpreter.getAllModules().filter((m) => m.name !== "std"),
      });
      const line = (source: string) =>
        parseScript(source).ast.body[0] as CommandExpressionNode;
      const owners = async (source: string) =>
        (await collectLineDeclaredErrors(line(source), lookup)).map(
          (entry) => `${entry.ownerLabel}:${entry.name}`,
        );

      // Command first, then helpers in argument order; renamed imports and
      // qualified names resolve to their real owner.
      expect(
        await owners("refuse @nope @declared:shared(true) --note @std:me"),
      ).toEqual([
        "declared:refuse:Refused",
        "declared:refuse:Shared",
        "declared:refuse:Same",
        "@declared:gonnaFail:Failure",
        "@declared:shared:Shared",
      ]);
      // A def helper, a def command and a module constant declare nothing —
      // and never borrow a same-named helper's or command's declarations.
      expect(await owners("go @me @declared:answer")).toEqual([]);
      expect(await owners("set $x @declared:answer(1)")).toEqual([
        "@declared:answer:Shared",
      ]);
      // On-chain faces are excluded even when spelled qualified.
      expect(await owners("set $x @declared:onchain!")).toEqual([]);
    });
  });

  describe("collision disambiguation", () => {
    it("an ambiguous bare name used by a capture is rejected before the line runs", async () => {
      await expect(
        run(
          'declared:refuse "shared" --note @declared:shared(false) -?!> Shared',
        ),
      ).rejects.toThrow(/more than one signature/);
      expect(calls.shared).toBe(0);
      expect(calls.refuse).toBe(0);
    });

    it("explicit signatures select either side", async () => {
      const command = await run(
        'declared:refuse "shared" --note @declared:shared(false) -?!> Shared(uint256) [$code]',
      );
      expect(command.text("$code")).toBe("7");

      const helper = await run(
        'declared:refuse "x" --note @declared:shared(true) -?!> Shared() $s',
      );
      expect(helper.text("$s")).toBe("true");
      expect(calls.refuse).toBe(1);
    });

    it("a collision alone does not invalidate a line that does not use the name", async () => {
      const { text } = await run(
        'declared:refuse "x" --note @declared:shared(false) -?!> Refused [$r]',
      );
      expect(text("$r")).toBe("x");
    });
  });

  describe("collecting blocks", () => {
    it("a composition-time refusal satisfies either arrow", async () => {
      const optional = await run(
        'declared:collect (\n  declared:refuse "x" -?!> Refused [$r]\n)',
      );
      expect(optional.text("$r")).toBe("x");

      const required = await run(
        'declared:collect (\n  declared:refuse "x" -!> Refused [$r]\n)',
      );
      expect(required.text("$r")).toBe("x");

      const helper = await run(
        "declared:collect (\n  set $x @declared:gonnaFail -!> Failure [$a]\n)",
      );
      expect(helper.text("$a")).toBe("1");
    });

    it("a zero-action success clears optional flags and fails required captures", async () => {
      const { text } = await run(
        "declared:collect (\n  set $x @declared:id(1) -?!> Failure $f\n)",
      );
      expect(text("$f")).toBe("false");

      await expect(
        run("declared:collect (\n  set $x @declared:id(1) -!> Failure\n)"),
      ).rejects.toThrow(/expected .*fail.* but it succeeded/i);
    });

    it("deferred transaction actions cannot satisfy a required capture", async () => {
      await expect(
        run(
          `declared:collect (\n  declared:send ${TARGET_A} ${TARGET_B} -!> Bounced\n)`,
        ),
      ).rejects.toThrow(/execution context/);

      const optional = await run(
        `declared:collect (\n  declared:send ${TARGET_A} ${TARGET_B} -?!> Bounced $b\n)`,
      );
      expect(optional.text("$b")).toBe("false");
    });
  });

  describe("structural checks before evaluation", () => {
    it("rejects error captures on if/loop before running the block", async () => {
      const { exec, text } = session();
      await expect(exec("if true (\n  set $x 1\n) -?!> $e")).rejects.toThrow(
        /not supported on block commands/,
      );
      expect(text("$x")).toBeUndefined();
    });

    it("rejects error captures on a local def command before running it", async () => {
      const { interpreter, text } = session();
      await expect(
        interpreter.interpret(
          'def go "$a: string" (\n  set $y $a\n)\ngo "1" -?!> $e',
        ),
      ).rejects.toThrow(/not supported on block commands/);
      expect(text("$y")).toBeUndefined();
    });

    it("rejects tx captures combined with error captures before running", async () => {
      await expect(
        run('declared:refuse "x" $> $tx -?!> Refused'),
      ).rejects.toThrow(/cannot be combined with error captures/);
      expect(calls.refuse).toBe(0);
    });
  });

  describe("block boundaries", () => {
    it("an outer command does not swallow an inner line's helper refusal", async () => {
      const { exec, text } = session();
      const thrown = await thrownBy(
        exec(
          "declared:wrap (\n  set $x @declared:gonnaFail\n) -?!> Failure $f",
        ),
      );
      expect(thrown).toBeInstanceOf(HelperFunctionError);
      expect((thrown as Error).message).toMatch(/the helper refused/);
      expect(text("$f")).toBeUndefined();
    });

    it("an outer command does not swallow an inner command's refusal", async () => {
      const { exec, text } = session();
      const thrown = await thrownBy(
        exec('declared:wrap (\n  declared:refuse "x"\n) -?!> Refused $r'),
      );
      expect(thrown).toBeInstanceOf(CommandError);
      expect((thrown as Error).message).toMatch(/refused: x/);
      expect(text("$r")).toBeUndefined();
    });

    it("an inner capture handles the refusal and the outer line succeeds", async () => {
      const { text } = await run(
        "declared:wrap (\n  set $x @declared:gonnaFail -?!> Failure $f\n) -?!> $e",
      );
      expect(text("$f")).toBe("true");
      expect(text("$e")).toBe("false");
    });
  });

  describe("transaction failures", () => {
    const bounce =
      (target: string, abi: typeof BOUNCED_ABI, code: bigint) =>
      async (action: Action) => {
        if ("to" in action && action.to === target) {
          throw new RevertError(
            "Transaction reverted",
            encodeErrorResult({ abi, errorName: abi[0].name, args: [code] }),
          );
        }
        return undefined;
      };

    it("a declared error matches a revert of a later action", async () => {
      const sent: Action[] = [];
      const callback = bounce(TARGET_B, BOUNCED_ABI, 9n);
      const { text } = await run(
        `declared:send ${TARGET_A} ${TARGET_B} -?!> Bounced [$code]`,
        async (action) => {
          sent.push(action);
          return callback(action);
        },
      );
      expect(text("$code")).toBe("9");
      // The first action was already sent: a captured later failure does
      // not roll it back.
      expect(sent.map((a) => ("to" in a ? a.to : undefined))).toEqual([
        TARGET_A,
        TARGET_B,
      ]);
    });

    it("contract metadata comes from the failing action's target", async () => {
      const withAbiOn = async (target: string) => {
        const s = session(bounce(TARGET_B, CUSTOM_ABI, 3n));
        s.interpreter.bindingsManager.setBinding(
          abiBindingKey(1, target as `0x${string}`),
          CUSTOM_ABI,
          BindingsSpace.ABI,
          true,
        );
        return s;
      };

      const failing = await withAbiOn(TARGET_B);
      await failing.exec(
        `declared:send ${TARGET_A} ${TARGET_B} -?!> Custom [$code]`,
      );
      expect(failing.text("$code")).toBe("3");

      const first = await withAbiOn(TARGET_A);
      await expect(
        first.exec(`declared:send ${TARGET_A} ${TARGET_B} -?!> Custom [$code]`),
      ).rejects.toThrow(/Transaction reverted/);
      expect(first.text("$code")).toBeUndefined();
    });

    it("a required capture still rejects a successful transaction", async () => {
      await expect(
        run(`declared:send ${TARGET_A} ${TARGET_B} -!> Bounced`),
      ).rejects.toThrow(/expected transaction to revert/);
    });
  });
});
