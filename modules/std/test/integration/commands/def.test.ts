import "../../setup";
import { BindingsSpace, Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";

const target = "0x44fA8E6f47987339850636F88629646662444217";
const fnSig = "approve(address,uint256)";

describeCommand("def", {
  describeName: "Std > commands > def",
  preamble: "load lang [@map @str.len @str.concat]",
  docCases: [
    {
      description: "Constant helper - returns a fixed address",
      code: `def @myAddr "address" 0x44fA8E6f47987339850636F88629646662444217\nset $result @myAddr`,
    },
    {
      description: "Helper with typed parameters",
      code: `def @double "$n: number -> number" @num($n * 2)\nset $result @double(5)`,
    },
    {
      description: "Boolean helper",
      code: `def @isPositive "$n: number -> bool" @bool($n > 0)\nset $result @isPositive(5)`,
    },
    {
      description: "Composition",
      code: `def @double "$n: number -> number" @num($n * 2)\ndef @quadruple "$n: number -> number" @double(@double($n))\nset $result @quadruple(3)`,
    },
    {
      description:
        "Inline module - a def of defs, used as if the module was loaded",
      code: `def module math (
  def @double "$n: number -> number" @num($n * 2)
)
set $result @math:double(21)`,
    },
    {
      description: "Guard clause - def return exits the command body early",
      code: `def maybe-print "$n: number" (
  if @bool($n == 0) (
    def return
  )
  print $n
)
maybe-print 0
maybe-print 5`,
    },
  ],
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
def @double "$n: number -> number" @num($n * 2)
set $result @double(5)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(10n, 1n))).to.be.true;
      },
    },
    {
      name: "should define a helper with optional param",
      script: `
def @addOpt "$a: number [$b: number] -> number" @num($a + $b)
set $result @addOpt(3 7)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(10n, 1n))).to.be.true;
      },
    },
    {
      name: "should fill an optional param by name (named arg)",
      script: `
def @scale "$n: number [$by: number] [$plus: number] -> number" @num($n * $by + $plus)
set $result @scale(5 plus:1 by:2)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(11n, 1n))).to.be.true;
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
    {
      name: "should return early from a command body with def return",
      script: `
def guarded-approve "$amount: number" (
  if @bool($amount == 0) (
    def return
  )
  exec ${target} ${fnSig} ${target} $amount
)
guarded-approve 0
guarded-approve 1e18`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should let def return exit the command body from inside a loop",
      script: `
def approve-first "$amounts: array" (
  loop $amount of $amounts (
    exec ${target} ${fnSig} ${target} $amount
    def return
  )
  exec ${target} ${fnSig} ${target} 999e18
)
approve-first [1e18 2e18 3e18]`,
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
        expect((inner as Num).eq(Num(99n, 1n))).to.be.true;
        expect(interpreter.getBinding("@scopedVal", BindingsSpace.DEF)).to.be
          .undefined;
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
        expect((outer as Num).eq(Num(1n, 1n))).to.be.true;
        expect(after).to.be.instanceOf(Num);
        expect((after as Num).eq(Num(1n, 1n))).to.be.true;
      },
    },

    // ── Type inference ──

    {
      name: "should infer param types and return type from nested helpers",
      script: `
def @catlen "$a $b" @str.len(@str.concat($a $b))
set $result @catlen("hello" "world")`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(10n, 1n))).to.be.true;
      },
    },
    {
      name: "should infer return type when params are explicit",
      script: `
def @double "$n: number" @num($n * 2)
set $result @double(5)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(10n, 1n))).to.be.true;
      },
    },
    {
      name: "should infer types with mixed explicit and bare params",
      script: `
def @greet "$greeting: string $name" @str.concat($greeting $name)
set $result @greet("hello " "world")`,
      validate: (_, interpreter) => {
        expect(interpreter.getBinding("$result", BindingsSpace.USER)).to.equal(
          "hello world",
        );
      },
    },
    {
      name: "should infer number type from arithmetic body",
      script: `
def @add "$a $b" @num($a + $b)
set $result @add(3 7)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(10n, 1n))).to.be.true;
      },
    },
    {
      name: "should infer types from chained user-defined helpers",
      script: `
def @double "$n" @num($n * 2)
def @quadruple "$n" @double(@double($n))
set $result @quadruple(3)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(12n, 1n))).to.be.true;
      },
    },
    {
      name: "should work with pass-through (unresolvable type stays any)",
      script: `
def @id "$x" $x
set $result @id(42)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(42n, 1n))).to.be.true;
      },
    },

    // ── Composition ──

    {
      name: "should allow user-defined helpers to call other user-defined helpers",
      script: `
def @inc "$n: number -> number" @num($n + 1)
def @incTwice "$n: number -> number" @inc(@inc($n))
set $result @incTwice(5)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(7n, 1n))).to.be.true;
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
def @double "$n: number -> number" @num($n * 2)
set $a @double(3)
set $b @double(10)`,
      validate: (_, interpreter) => {
        const a = interpreter.getBinding("$a", BindingsSpace.USER);
        const b = interpreter.getBinding("$b", BindingsSpace.USER);
        expect(a).to.be.instanceOf(Num);
        expect((a as Num).eq(Num(6n, 1n))).to.be.true;
        expect(b).to.be.instanceOf(Num);
        expect((b as Num).eq(Num(20n, 1n))).to.be.true;
      },
    },

    // ── First-class helper params ──

    {
      name: "should accept a helper param and forward calls through it",
      script: `
def @double "$n: number -> number" @num($n * 2)
def @apply "$n: number @fn -> number" @fn($n)
set $result @apply(5 @double)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(10n, 1n))).to.be.true;
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
def @double "$n: number -> number" @num($n * 2)
set $items [1 2 3]
set $result @map($items @double)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.an("array");
        const nums = val as Num[];
        expect(nums).to.have.length(3);
        expect((nums[0] as Num).eq(Num(2n, 1n))).to.be.true;
        expect((nums[1] as Num).eq(Num(4n, 1n))).to.be.true;
        expect((nums[2] as Num).eq(Num(6n, 1n))).to.be.true;
      },
    },
    {
      name: "should forward helper params through a def that wraps @map",
      script: `
def @double "$n: number -> number" @num($n * 2)
def @myMap "$arr: array @fn -> array" @map($arr @fn)
set $items [1 2 3]
set $result @myMap($items @double)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.an("array");
        const nums = val as Num[];
        expect(nums).to.have.length(3);
        expect((nums[0] as Num).eq(Num(2n, 1n))).to.be.true;
        expect((nums[1] as Num).eq(Num(4n, 1n))).to.be.true;
        expect((nums[2] as Num).eq(Num(6n, 1n))).to.be.true;
      },
    },
    {
      name: "should chain two helper params (double @map)",
      script: `
def @double "$n: number -> number" @num($n * 2)
def @inc "$n: number -> number" @num($n + 1)
def @mapTwice "$arr: array @first @second -> array" @map(@map($arr @first) @second)
set $items [1 2 3]
set $result @mapTwice($items @double @inc)`,
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$result", BindingsSpace.USER);
        expect(val).to.be.an("array");
        const nums = val as Num[];
        expect(nums).to.have.length(3);
        expect((nums[0] as Num).eq(Num(3n, 1n))).to.be.true;
        expect((nums[1] as Num).eq(Num(5n, 1n))).to.be.true;
        expect((nums[2] as Num).eq(Num(7n, 1n))).to.be.true;
      },
    },
    {
      // `@name` and `@name!` are independent bindings: neither derives
      // from the other, and defining one leaves the other free.
      name: "should bind a bang def separately from its non-bang twin",
      script: `
def @double "$x: number -> number" @num($x * 2)
def @double! "$x: number -> number" @num!($x * 2)
set $r @double(3)`,
      validate: (_actions, interpreter) => {
        expect(
          interpreter.getBinding("$r", BindingsSpace.USER)?.toString(),
        ).to.equal("6");
        expect(interpreter.getBinding("@double", BindingsSpace.DEF)).to.exist;
        expect(interpreter.getBinding("@double!", BindingsSpace.DEF)).to.exist;
      },
    },
  ],
  errorCases: [
    {
      // A `!` def compiles into an assertion; it has no off-chain face.
      // The interpreter reaches DEF before defineHelper's own guard, so
      // without this check the call would silently interpret.
      name: "should refuse to run a bang def off-chain",
      script: `
def @double! "$x: number -> number" @num!($x * 2)
set $r @double!(3)`,
      error: "only valid inside an on-chain expression",
    },
    {
      // An on-chain body compiles rather than runs, so inferTypes cannot
      // learn anything from it. Ask for the signature instead of guessing.
      name: "should require a typed signature on a bang def",
      script: `def @double! "$x" @num!($x * 2)`,
      error: "needs a fully typed signature",
    },
    {
      name: "should require a return type on a bang def",
      script: `def @double! "$x: number" @num!($x * 2)`,
      error: "return type is missing",
    },
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
def @add "$a: number $b: number -> number" @num($a + $b)
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
      error: "helper @scoped not found",
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
      error: "command my-cmd not found",
    },
    {
      name: "should fail on def return outside a def command body",
      script: "def return",
      error: '"def return" can only be used inside a def command body',
    },
    {
      name: "should fail when def return has extra arguments",
      script: `
def noisy "" (
  def return "now"
)
noisy`,
      error: '"def return" takes no arguments',
    },
    {
      name: "should fail on def return directly inside a module block",
      script: `
def module m (
  def return
)`,
      error: '"def return" can only be used inside a def command body',
    },
  ],
});
