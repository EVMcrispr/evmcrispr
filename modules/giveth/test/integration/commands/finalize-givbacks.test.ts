import "../../setup";
import { defaultRelayerMap } from "@evmcrispr/module-giveth/addresses";
import {
  createInterpreter,
  describeCommand,
  expect,
  getPublicClient,
} from "@evmcrispr/test-utils";

const defaultRelayerAddr = defaultRelayerMap.get(100)!;

const validateFinalizeGivbacks =
  (relayerAddr: string = defaultRelayerAddr) =>
  async (result: any) => {
    const ipfsHash = "QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr";
    const client = getPublicClient();

    const batches = await fetch(
      `https://ipfs.blossom.software/ipfs/${ipfsHash}`,
    ).then((data) => data.json());

    const interpreter2 = createInterpreter(
      batches
        .map(
          (batch: any) =>
            `exec ${relayerAddr} executeBatch(uint256,address[],uint256[]) ${
              batch.nonce
            } [${batch.recipients.join(",")}] [${batch.amounts.join(",")}]`,
        )
        .join("\n"),
      client,
    );

    const result2 = await interpreter2.interpret();
    expect(result).eql(result2);
  };

describeCommand("finalize-givbacks", {
  describeName:
    "Giveth > commands > finalize-givbacks <ipfsHash> [--relayer <relayer>]",
  module: "giveth",
  preamble: "load giveth",
  cases: [
    {
      name: "should return a correct initiate-givbacks action",
      script:
        "giveth:finalize-givbacks QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr",
      validate: validateFinalizeGivbacks(),
    },
    {
      name: "should return a correct initiate-givbacks action when another relayer is passed",
      script:
        "giveth:finalize-givbacks QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr --relayer 0xCa60c66a8C3449047c213295eCd82C80B1529a10",
      validate: validateFinalizeGivbacks(
        "0xCa60c66a8C3449047c213295eCd82C80B1529a10",
      ),
    },
  ],
  errorCases: [
    {
      name: "should fail when the chain has no default relayer",
      script:
        "switch 137\ngiveth:finalize-givbacks QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr",
      error: "No default relayer",
    },
  ],
});
