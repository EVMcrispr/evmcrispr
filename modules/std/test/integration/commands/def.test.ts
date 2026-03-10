import "../../setup";
import { BindingsSpace, encodeAction, Num } from "@evmcrispr/sdk";
import { describeCommand, expect } from "@evmcrispr/test-utils";

const target = "0x44fA8E6f47987339850636F88629646662444217";
const fnSig = "approve(address,uint256)";

describeCommand("def", {
  describeName: "Std > commands > def",
  cases: [
    // ── Helper definitions ──

    {
      name: "should define a constant helper with return type only",
      script: `
def @myAddr "address" 0x44fA8E6f47987339850636F88629646662444217
set $result @myAddr`,
      validate: (_, interpreter) => {
        expect(interpreter.getBinding("$result", BindingsSpace.USER)).to.equal(
          "0x44fA8E6f47987339850636F88629646662444217",
        );
      },
    },
    {
      name: "should define a helper with one required param",
      script: `
def @double "$n: number -> number" ($n * 2)
set $result @double(5)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(new Num(10n, 1n))).to.be.true;
      },
    },
    {
      name: "should define a helper with optional param",
      script: `
def @addOpt "$a: number [$b: number] -> number" ($a + $b)
set $result @addOpt(3 7)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(new Num(10n, 1n))).to.be.true;
      },
    },
    {
      name: "should define a helper using other helpers in the body",
      script: `
def @isPositive "$n: number -> bool" @bool($n > 0)
set $yes @isPositive(5)
set $no @isPositive(0)`,
      validate: (_, interpreter) => {
        expect(interpreter.getBinding("$yes", BindingsSpace.USER)).to.equal(
          "true",
        );
        expect(interpreter.getBinding("$no", BindingsSpace.USER)).to.equal(
          "false",
        );
      },
    },

    // ── Command definitions ──

    {
      name: "should define a command that produces actions",
      script: `
def my-approve "$addr: address $amount: number" (
  exec ${target} ${fnSig} $addr $amount
)
my-approve ${target} 100e18`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should define a command with no params",
      script: `
def approve-self "" (
  exec ${target} ${fnSig} ${target} 1e18
)
approve-self`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should define a command with options",
      script: `
def approve-with-opt "[$amount: number] [--target: address]" (
  exec ${target} ${fnSig} ${target} 1e18
)
approve-with-opt 50e18 --target ${target}`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },

    // ── Scoping ──

    {
      name: "should scope definitions to the block they are defined in",
      script: `
if true (
  def @scopedVal "number" 99
  set $inner @scopedVal
)`,
      validate: (_, interpreter) => {
        const inner = interpreter.getBinding("$inner", BindingsSpace.USER);
        expect(inner).to.be.instanceOf(Num);
        expect((inner as Num).eq(new Num(99n, 1n))).to.be.true;
        expect(
          interpreter.getBinding("@scopedVal", BindingsSpace.DEF),
        ).to.be.undefined;
      },
    },
    {
      name: "should allow inner scopes to shadow outer definitions",
      script: `
def @val "number" 1
set $outer @val
if true (
  def @val "number" 2
  set $inner @val
)
set $after @val`,
      validate: (_, interpreter) => {
        const outer = interpreter.getBinding("$outer", BindingsSpace.USER);
        const after = interpreter.getBinding("$after", BindingsSpace.USER);
        expect(outer).to.be.instanceOf(Num);
        expect((outer as Num).eq(new Num(1n, 1n))).to.be.true;
        expect(after).to.be.instanceOf(Num);
        expect((after as Num).eq(new Num(1n, 1n))).to.be.true;
      },
    },

    // ── Composition ──

    {
      name: "should allow user-defined helpers to call other user-defined helpers",
      script: `
def @inc "$n: number -> number" ($n + 1)
def @incTwice "$n: number -> number" @inc(@inc($n))
set $result @incTwice(5)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(new Num(7n, 1n))).to.be.true;
      },
    },
    {
      name: "should allow user-defined commands to use user-defined helpers",
      script: `
def @myTarget "address" ${target}
def do-approve "" (
  exec @myTarget ${fnSig} @myTarget 1e18
)
do-approve`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should allow calling user-defined helpers multiple times",
      script: `
def @double "$n: number -> number" ($n * 2)
set $a @double(3)
set $b @double(10)`,
      validate: (_, interpreter) => {
        const a = interpreter.getBinding("$a", BindingsSpace.USER);
        const b = interpreter.getBinding("$b", BindingsSpace.USER);
        expect(a).to.be.instanceOf(Num);
        expect((a as Num).eq(new Num(6n, 1n))).to.be.true;
        expect(b).to.be.instanceOf(Num);
        expect((b as Num).eq(new Num(20n, 1n))).to.be.true;
      },
    },

    // ── First-class helper params ──

    {
      name: "should accept a helper param and forward calls through it",
      script: `
def @double "$n: number -> number" ($n * 2)
def @apply "$n: number @fn -> number" @fn($n)
set $result @apply(5 @double)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(new Num(10n, 1n))).to.be.true;
      },
    },
    {
      name: "should pass a built-in helper as a helper param",
      script: `
def @negate "$x: number @op -> bool" @op($x < 0)
set $result @negate(5 @bool)`,
      validate: (_, interpreter) => {
        expect(interpreter.getBinding("$result", BindingsSpace.USER)).to.equal(
          "false",
        );
      },
    },
    {
      name: "should work with @map and a helper param",
      script: `
def @double "$n: number -> number" ($n * 2)
set $items [1 2 3]
set $result @map($items @double)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.an("array");
        const nums = val as Num[];
        expect(nums).to.have.length(3);
        expect((nums[0] as Num).eq(new Num(2n, 1n))).to.be.true;
        expect((nums[1] as Num).eq(new Num(4n, 1n))).to.be.true;
        expect((nums[2] as Num).eq(new Num(6n, 1n))).to.be.true;
      },
    },
    {
      name: "should forward helper params through a def that wraps @map",
      script: `
def @double "$n: number -> number" ($n * 2)
def @myMap "$arr: array @fn -> array" @map($arr @fn)
set $items [1 2 3]
set $result @myMap($items @double)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.an("array");
        const nums = val as Num[];
        expect(nums).to.have.length(3);
        expect((nums[0] as Num).eq(new Num(2n, 1n))).to.be.true;
        expect((nums[1] as Num).eq(new Num(4n, 1n))).to.be.true;
        expect((nums[2] as Num).eq(new Num(6n, 1n))).to.be.true;
      },
    },
    {
      name: "should chain two helper params (double @map)",
      script: `
def @double "$n: number -> number" ($n * 2)
def @inc "$n: number -> number" ($n + 1)
def @mapTwice "$arr: array @first @second -> array" @map(@map($arr @first) @second)
set $items [1 2 3]
set $result @mapTwice($items @double @inc)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.an("array");
        const nums = val as Num[];
        expect(nums).to.have.length(3);
        expect((nums[0] as Num).eq(new Num(3n, 1n))).to.be.true;
        expect((nums[1] as Num).eq(new Num(5n, 1n))).to.be.true;
        expect((nums[2] as Num).eq(new Num(7n, 1n))).to.be.true;
      },
    },
  ],

  errorCases: [
    {
      name: "should fail when redefining in the same scope (constant semantics)",
      script: `
def @foo "number" 1
def @foo "number" 2`,
      error: "already exists",
    },
    {
      name: "should fail when calling a user-defined helper with too few args",
      script: `
def @add "$a: number $b: number -> number" ($a + $b)
set $r @add(1)`,
      error: "expects 2 argument(s), got 1",
    },
    {
      name: "should fail when calling a user-defined helper with too many args",
      script: `
def @id "$x: number -> number" $x
set $r @id(1 2)`,
      error: "expects 1 argument(s), got 2",
    },
    {
      name: "should fail when calling a scoped helper outside its scope",
      script: `
if true (
  def @scoped "number" 42
)
set $r @scoped`,
      error: "helper not found",
    },
    {
      name: "should fail when a non-helper is passed to a helper param",
      script: `
def @apply "$n: number @fn -> number" @fn($n)
set $result @apply(5 42)`,
      error: "@fn must be a helper reference",
    },
    {
      name: "should fail when calling a scoped command outside its scope",
      script: `
if true (
  def my-cmd "" (
    print 1
  )
)
my-cmd`,
      error: "command not found",
    },
  ],
});
