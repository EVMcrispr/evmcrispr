import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { defaultRelayerMap } from "@evmcrispr/module-giveth/addresses";

import { CommandError } from "@evmcrispr/sdk";
import {
  createInterpreter,
  expect,
  expectThrowAsync,
  getPublicClient,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";
import { findGivethCommandNode } from "../../test-helpers/test-helpers";

const defaultRelayerAddr = defaultRelayerMap.get(100)!;

describe("Giveth > commands > verify-givbacks <ipfsHash> <voteId> [--relayer <relayer>]", () => {
  let client: PublicClient;

  beforeAll(async () => {
    client = getPublicClient();
  });

  const testVerifyGivbacks =
    (
      relayerAddr: string = defaultRelayerAddr,
      ipfsHash = "QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr",
      voteId = 49,
    ) =>
    async () => {
      const interpreter = createInterpreter(
        relayerAddr === defaultRelayerAddr
          ? `
          load giveth
          giveth:verify-givbacks ${ipfsHash} ${voteId}`
          : `
          load giveth
          giveth:verify-givbacks ${ipfsHash} ${voteId} --relayer ${relayerAddr}`,
        client,
      );

      const interpreter2 = createInterpreter(
        `
        load aragonos
        aragonos:connect 0xA1514067E6fE7919FB239aF5259FfF120902b4f9 (
          exec @app(voting:1) vote(uint256,bool) ${voteId} true
        )`,
        client,
      );

      const result = await interpreter.interpret();
      const result2 = await interpreter2.interpret();

      expect(result).eql(result2);
    };

  it("should return a correct verify-givbacks action", testVerifyGivbacks());
  it(
    "should return a correct verify-givbacks action with multiple batches",
    testVerifyGivbacks(
      defaultRelayerAddr,
      "QmUz2rm8wDV5ZWNjwehWLEoUoviXwGapgYokmfqEuy4nW9",
      131,
    ),
  );
  it("should fail when hash do not match the vote", async () => {
    const ipfsHash = "QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws1";
    const voteId = 49;
    const interpreter = createInterpreter(
      `load giveth
        giveth:verify-givbacks ${ipfsHash} ${voteId}`,
      client,
    );

    const c = findGivethCommandNode(interpreter.ast, "verify-givbacks")!;
    const error = new CommandError(
      c,
      `Vote script does not match script in ${ipfsHash}. The IPFS hash do not correspond to the one in the script.`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
