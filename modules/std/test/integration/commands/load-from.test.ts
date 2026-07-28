import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { createInterpreter, describeCommand } from "@evmcrispr/test-utils/evml";
import { encryptedModule, ipfsGatewayFixtures } from "../../setup";

const MODULE_CID = ipfsGatewayFixtures.moduleFile.cid;
const BARE_PIN_CID = ipfsGatewayFixtures.moduleBarePin.cid;
const TWO_CMDS_CID = ipfsGatewayFixtures.moduleTwoCommands.cid;
const ENCRYPTED_CID = ipfsGatewayFixtures.encryptedPin.cid;
const MISSING_CID = ipfsGatewayFixtures.missing.cid;

describeCommand("load", {
  describeName: "Std > commands > load --from",
  cases: [
    {
      name: "should load an external module under its canonical name",
      script: `load math --from ipfs://${MODULE_CID}
set $x @str(@math:double(21))`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$x", "USER" as any)).to.equal("42");
      },
    },
    {
      name: "should load under a local alias with name>alias",
      script: `load math>mylib --from ipfs://${MODULE_CID}
set $x @str(@mylib:double(21))`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$x", "USER" as any)).to.equal("42");
      },
    },
    {
      name: "should expose external def commands producing actions",
      script: `load math --from ipfs://${MODULE_CID}
math:pause 3`,
      validate: (actions) => {
        expect(actions).to.deep.equal([
          { type: "terminal", command: "wait", args: { seconds: 3 } },
        ]);
      },
    },
    {
      name: "should support import lists with renames",
      script: `load math --from ipfs://${MODULE_CID} [@double>@dbl pause]
set $x @str(@dbl(5))`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$x", "USER" as any)).to.equal("10");
      },
    },
    {
      name: "should load modules from bare {title, script} share pins",
      script: `load math>q --from ipfs://${BARE_PIN_CID}
set $x @str(@q:triple(4))`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$x", "USER" as any)).to.equal("12");
      },
    },
    {
      name: "should decrypt encrypted share pins given the link key",
      script: `load math>enc --from "ipfs://${encryptedModule.cid}#${encryptedModule.key}"
set $x @str(@enc:quadruple(4))`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$x", "USER" as any)).to.equal("16");
      },
    },
    {
      name: "should shadow registered-but-unloaded names",
      script: `load math>safe --from ipfs://${MODULE_CID}
set $x @str(@safe:double(21))`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$x", "USER" as any)).to.equal("42");
      },
    },
    {
      name: "should allow the same file under two aliases",
      script: `load math>a --from ipfs://${MODULE_CID}
load math>b --from ipfs://${MODULE_CID}
set $first @str(@a:double(1))
set $second @str(@b:double(2))`,
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$first", "USER" as any)).to.equal("2");
        expect(interpreter.getBinding("$second", "USER" as any)).to.equal("4");
      },
    },
  ],
  errorCases: [
    {
      name: "should validate the declared name against the load line",
      script: `load wrongname --from ipfs://${MODULE_CID}`,
      error: 'declares module "math", not "wrongname"',
    },
    {
      name: "should keep the canonical name unavailable when aliased",
      script: `load math>mylib --from ipfs://${MODULE_CID}
set $x @math:double(2)`,
      error: "module math not loaded",
    },
    {
      name: "should reject renames without --from",
      script: "load aragonos>ar",
      error: "only supported with --from",
    },
    {
      name: "should reject non-ipfs sources",
      script: "load x --from https://example.com/lib.evml",
      error: "--from only supports",
    },
    {
      name: "should reject files with more than one top-level command",
      script: `load math --from ipfs://${TWO_CMDS_CID}`,
      error: "must contain exactly one def module command",
    },
    {
      name: "should reject encrypted share pins without a key",
      script: `load x --from ipfs://${ENCRYPTED_CID}`,
      error: "encrypted share link",
    },
    {
      name: "should reject encrypted share pins with a wrong key",
      script: `load math --from "ipfs://${encryptedModule.cid}#${"A".repeat(43)}"`,
      error: "Invalid decryption key",
    },
    {
      name: "should surface fetch failures",
      script: `load x --from ipfs://${MISSING_CID}`,
      error: "Couldn't fetch",
    },
    {
      name: "should reject aliases already bound by a loaded module",
      script: `load safe
load math>safe --from ipfs://${MODULE_CID}`,
      error: "module safe already loaded",
    },
  ],
});

// --from is experimental: the suite above runs with the flag on (test
// preload); this checks the runtime guard with the flag off.
describe("Std > commands > load --from experimental gating", () => {
  it("rejects --from when VITE_PUBLIC_EXPERIMENTAL is off", async () => {
    const saved = process.env.VITE_PUBLIC_EXPERIMENTAL;
    delete process.env.VITE_PUBLIC_EXPERIMENTAL;
    try {
      const interpreter = createInterpreter(
        `load math --from ipfs://${MODULE_CID}`,
        null as any,
      );
      let error: Error | undefined;
      try {
        await interpreter.interpret();
      } catch (e) {
        error = e as Error;
      }
      expect(error?.message).to.match(/--from.*experimental/);
    } finally {
      process.env.VITE_PUBLIC_EXPERIMENTAL = saved;
    }
  });
});
