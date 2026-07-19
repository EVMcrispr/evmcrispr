import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";

// `def module <name> ( ...defs )` — inline EVML module definitions.
describeCommand("def", {
  describeName: "Std > commands > def module",
  cases: [
    {
      name: "should expose defs as qualified helpers",
      script: `def module math (
  def @double "$n: number -> number" @num($n * 2)
)
set $x @str(@math:double(21))`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$x", "USER" as any)).to.equal("42");
      },
    },
    {
      name: "should expose defs as qualified commands producing actions",
      script: `def module m (
  def pause "$n: number" (
    wait $n
  )
)
m:pause 3`,
      validate: (actions) => {
        expect(actions).to.deep.equal([
          { type: "terminal", command: "wait", args: { seconds: 3 } },
        ]);
      },
    },
    {
      name: "should resolve sibling defs unqualified inside def bodies",
      script: `def module math (
  def @double "$n: number -> number" @num($n * 2)
  def @quad "$n: number -> number" @double(@double($n))
)
set $x @str(@math:quad(3))`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$x", "USER" as any)).to.equal("12");
      },
    },
    {
      name: "should keep module-def sets scope-local (no leak to caller)",
      script: `set $tmp "outer"
def module m (
  def pause "$n: number" (
    set $tmp @num($n * 2)
    wait $tmp
  )
)
m:pause 2`,
      validate: (actions, interpreter) => {
        expect(actions).to.deep.equal([
          { type: "terminal", command: "wait", args: { seconds: 4 } },
        ]);
        expect(interpreter.getBinding("$tmp", "USER" as any)).to.equal("outer");
      },
    },
    {
      name: "should let local modules shadow registered-but-unloaded names",
      script: `def module safe (
  def @x "number" 7
)
set $v @str(@safe:x)`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$v", "USER" as any)).to.equal("7");
      },
    },
    {
      name: "should let module defs shadow same-named caller defs",
      script: `def @val "number" 1
def module m (
  def @val "number" 2
  def @probe "-> number" @val
)
set $inner @str(@m:probe)
set $outer @str(@val)`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$inner", "USER" as any)).to.equal("2");
        expect(interpreter.getBinding("$outer", "USER" as any)).to.equal("1");
      },
    },
  ],
  errorCases: [
    {
      name: "should deny config-variable reads from module defs",
      script: `def module m (
  def @leak "-> string" @str($std:tokenlist)
)
set $x @m:leak`,
      error: "only accessible to their own module and the user script",
    },
    {
      name: "should deny config-variable writes from module defs",
      script: `def module m (
  def poke "" (
    set $std:tokenlist "https://evil.example"
  )
)
m:poke`,
      error: "only accessible to their own module and the user script",
    },
    {
      name: "should not leak module defs into the caller scope",
      script: `def module m (
  def @hidden "number" 7
)
set $x @hidden`,
      error: "helper @hidden not found",
    },
    {
      name: "should reject non-def commands in the block",
      script: `def module m (
  set $x 1
)`,
      error: 'module blocks may only contain def commands (found "set")',
    },
    {
      name: "should reject nested module definitions",
      script: `def module m (
  def module inner (
    def @x "number" 1
  )
)`,
      error: "nested module definitions are not allowed",
    },
    {
      name: "should reject a reserved name",
      script: `def module std (
  def @x "number" 1
)`,
      error: 'module name "std" is reserved',
    },
    {
      name: "should reject names already bound by a loaded module",
      script: `load safe
def module safe (
  def @x "number" 1
)`,
      error: "module safe already loaded",
    },
    {
      name: "should reject duplicate module names",
      script: `def module m (
  def @x "number" 1
)
def module m (
  def @y "number" 2
)`,
      error: "module m already loaded",
    },
    {
      name: "should reject duplicate def names inside a module",
      script: `def module m (
  def @x "number" 1
  def @x "number" 2
)`,
      error: "duplicate def name in module m",
    },
    {
      name: "should reject defining a plain command named module",
      script: `def module "$a: string" (
  print $a
)`,
      error: '"module" is reserved',
    },
  ],
});
