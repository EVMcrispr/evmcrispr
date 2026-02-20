import "../../setup";
import type { CommandExpressionNode } from "@evmcrispr/sdk";
import { CommandError } from "@evmcrispr/sdk";
import {
  createInterpreter,
  describeCommand,
  expect,
  getPublicClient,
} from "@evmcrispr/test-utils";
import { defaultRelayerMap } from "@evmcrispr/module-giveth/addresses";

const defaultRelayerAddr = defaultRelayerMap.get(100)!;

const validateVerifyGivbacks =
  (
    relayerAddr: string = defaultRelayerAddr,
    ipfsHash = "QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr",
    voteId = 49,
  ) =>
  async (result: any) => {
    const client = getPublicClient();
    const interpreter2 = createInterpreter(
      `
      load aragonos
      aragonos:connect 0xA1514067E6fE7919FB239aF5259FfF120902b4f9 (
        exec @app(voting:1) vote(uint256,bool) ${voteId} true
      )`,
      client,
    );

    const result2 = await interpreter2.interpret();
    expect(result).eql(result2);
  };

describeCommand("verify-givbacks", {
  describeName:
    "Giveth > commands > verify-givbacks <ipfsHash> <voteId> [--relayer <relayer>]",
  module: "giveth",
  preamble: "load giveth",
  cases: [
    {
      name: "should return a correct verify-givbacks action",
      script:
        "giveth:verify-givbacks QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr 49",
      validate: validateVerifyGivbacks(),
    },
    {
      name: "should return a correct verify-givbacks action with multiple batches",
      script:
        "giveth:verify-givbacks QmUz2rm8wDV5ZWNjwehWLEoUoviXwGapgYokmfqEuy4nW9 131",
      validate: validateVerifyGivbacks(
        defaultRelayerAddr,
        "QmUz2rm8wDV5ZWNjwehWLEoUoviXwGapgYokmfqEuy4nW9",
        131,
      ),
    },
  ],
  errorCases: [
    {
      name: "should fail when hash do not match the vote",
      script:
        "giveth:verify-givbacks QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws1 49",
      error: (interpreter) => {
        const c = interpreter.ast.body.find(
          (n) =>
            (n as CommandExpressionNode).name === "verify-givbacks",
        ) as CommandExpressionNode;
        return new CommandError(
          c,
          "Vote script does not match script in QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws1. The IPFS hash do not correspond to the one in the script.",
        );
      },
    },
    {
      name: "should fail when the chain is not supported",
      script:
        "switch 137\ngiveth:verify-givbacks QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr 49",
      error: "can't be sent",
    },
    {
      name: "should fail when vote script has incorrect target",
      script:
        "giveth:verify-givbacks QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr 42",
      error: "does not match",
    },
  ],
});
