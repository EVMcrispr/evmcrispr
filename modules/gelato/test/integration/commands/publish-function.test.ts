import "../../setup";
import { BindingsSpace } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import { TEST_CID, uploads } from "../../fixtures/msw-handlers";

const FUNCTION = `<<<TS
import { Web3Function, Web3FunctionContext } from "@gelatonetwork/web3-functions-sdk";

Web3Function.onRun(async ({ userArgs }: Web3FunctionContext) => {
  return { canExec: true, callData: [{ to: userArgs.vault as string, data: "0x" }] };
});
TS`;

describeCommand("publish-function", {
  module: "gelato",
  preamble: "load gelato",
  cases: [
    {
      name: "bundles, uploads and binds the CID",
      timeout: 120_000,
      script: `gelato:publish-function $cid ${FUNCTION} --user-args [[vault string]] --memory 256 --timeout 60 --title "vault keeper"`,
      validate: (actions, interpreter) => {
        expect(actions).to.have.length(0);
        expect(interpreter.getBinding("$cid", BindingsSpace.USER)).to.eq(
          TEST_CID,
        );
        const upload = uploads[uploads.length - 1];
        expect(upload.title).to.eq("vault keeper");
        expect(upload.bytes).to.be.greaterThan(10_000);
      },
    },
    {
      name: "lets the CID feed a --function task with typed user args",
      timeout: 120_000,
      script: `gelato:publish-function $cid ${FUNCTION} --user-args [[vault string]]
gelato:automate --function $cid --args [[vault 0x4F2083f5fBede34C2714aFfb3105539775f7FE64]] --every 5m`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "inside sim:fork the placeholder CID feeds a --function task",
      timeout: 120_000,
      script: `load sim
load lang
sim:fork --using anvil (
  sim:set-balance @me 100e18
  gelato:publish-function $cid ${FUNCTION} --user-args [[vault string]]
  gelato:automate --function $cid --args [[vault 0x4F2083f5fBede34C2714aFfb3105539775f7FE64]] --every 5m
  sim:expect @bool(@lang:len(@gelato:tasks()) == 1)
)`,
      validate: (_actions, interpreter) => {
        // The mocked upload endpoint always answers TEST_CID, so a
        // placeholder proves nothing was uploaded.
        expect(
          String(interpreter.getBinding("$cid", BindingsSpace.USER)),
        ).to.match(/^simulated-/);
      },
    },
  ],
  errorCases: [
    {
      name: "a placeholder CID is unknown once its sim:fork ends",
      script: `load sim
sim:fork --using anvil (
  gelato:publish-function $cid ${FUNCTION} --user-args [[vault string]]
)
gelato:automate --function $cid --args [[vault 0x4F2083f5fBede34C2714aFfb3105539775f7FE64]] --every 5m`,
      error: "Gelato's function store has no Web3 Function simulated-",
    },
    {
      name: "rejects an unsupported memory size",
      script: `gelato:publish-function $cid ${FUNCTION} --memory 200`,
      error: "--memory must be one of",
    },
    {
      name: "rejects a timeout out of range",
      script: `gelato:publish-function $cid ${FUNCTION} --timeout 1000`,
      error: "--timeout must be",
    },
    {
      name: "rejects an unknown user arg type",
      script: `gelato:publish-function $cid ${FUNCTION} --user-args [[vault address]]`,
      error: "expected one of",
    },
    {
      name: "rejects user args the function does not declare",
      script: `gelato:publish-function $cid ${FUNCTION} --user-args [[vault string]]
gelato:automate --function $cid --args [[vault 0x4F2083f5fBede34C2714aFfb3105539775f7FE64] [extra 1]] --every 5m`,
      error: 'unknown user arg "extra"',
    },
  ],
  docCases: [
    {
      description:
        "Publish a function that tops up a vault whenever its balance drops, then schedule it every 5 minutes",
      code: `gelato:publish-function $cid <<<TS
import { Web3Function, Web3FunctionContext } from "@gelatonetwork/web3-functions-sdk";
import { Contract } from "ethers";

Web3Function.onRun(async ({ userArgs, multiChainProvider }: Web3FunctionContext) => {
  const vault = new Contract(
    userArgs.vault as string,
    ["function needsTopUp() view returns (bool)", "function topUp()"],
    multiChainProvider.default(),
  );
  if (!(await vault.needsTopUp())) return { canExec: false, message: "vault is fine" };
  return {
    canExec: true,
    callData: [{ to: userArgs.vault as string, data: vault.interface.encodeFunctionData("topUp") }],
  };
});
TS --user-args [[vault string]]
gelato:automate --function $cid --args [[vault 0x4F2083f5fBede34C2714aFfb3105539775f7FE64]] --every 5m`,
    },
  ],
});
