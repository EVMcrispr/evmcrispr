import "../../setup";
import { describe, it } from "bun:test";
import { ExitSignal } from "@evmcrispr/sdk";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter, describeCommand } from "@evmcrispr/test-utils/evml";

const target = "0x44fA8E6f47987339850636F88629646662444217";
const fnSig = "approve(address,uint256)";

describeCommand("exit", {
  describeName: "Std > commands > exit",
  docCases: [
    {
      description: "Stop script execution",
      code: `print "before"\nexit`,
    },
  ],
  errorCases: [
    {
      name: "should stop interpretation with an ExitSignal",
      script: `exit\nprint "after"`,
      error: "Script execution stopped by exit",
    },
  ],
});

describe("Std > commands > exit", () => {
  it("should stop after executing earlier actions", async () => {
    const interpreter = createInterpreter(
      `
exec ${target} ${fnSig} ${target} 1e18
exit
exec ${target} ${fnSig} ${target} 2e18`,
      getPublicClient(),
    );

    const seen: unknown[] = [];
    let exited = false;
    try {
      await interpreter.evm.interpret(interpreter.script, async (action) => {
        seen.push(action);
      });
    } catch (err) {
      if (!(err instanceof ExitSignal)) throw err;
      exited = true;
    }

    expect(exited).to.be.true;
    expect(seen).to.have.length(1);
  });

  it("should stop the whole script from inside a loop and a def body", async () => {
    const interpreter = createInterpreter(
      `
def guard "" (
  exit
)
loop $i of [1 2 3] (
  exec ${target} ${fnSig} ${target} 1e18
  guard
)`,
      getPublicClient(),
    );

    const seen: unknown[] = [];
    let exited = false;
    try {
      await interpreter.evm.interpret(interpreter.script, async (action) => {
        seen.push(action);
      });
    } catch (err) {
      if (!(err instanceof ExitSignal)) throw err;
      exited = true;
    }

    expect(exited).to.be.true;
    expect(seen).to.have.length(1);
  });
});
