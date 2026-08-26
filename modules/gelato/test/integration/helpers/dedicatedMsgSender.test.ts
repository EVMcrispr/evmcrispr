import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { isAddress } from "viem";
import { CHECKER } from "../../fixtures";

describeHelper("@gelato:dedicatedMsgSender", {
  module: "gelato",
  cases: [
    {
      name: "resolves a deterministic proxy address for any account",
      input: `@gelato:dedicatedMsgSender(${CHECKER})`,
      validate: (value: unknown) => {
        expect(isAddress(String(value))).to.eq(true);
        expect(String(value).toLowerCase()).to.not.eq(CHECKER.toLowerCase());
      },
    },
  ],
  docCases: [
    {
      description:
        "The address your tasks call from — whitelist it in contracts that restrict callers",
      code: `set $executor @gelato:dedicatedMsgSender()`,
    },
  ],
});

describeHelper("@gelato:automate", {
  module: "gelato",
  cases: [
    {
      name: "returns the Automate address on gnosis",
      input: "@gelato:automate()",
      validate: (value: unknown) => {
        expect(String(value).toLowerCase()).to.eq(
          "0x2A6C106ae13B558BB9E2Ec64Bd2f1f7BEFF3A5E0".toLowerCase(),
        );
      },
    },
  ],
  docCases: [
    {
      description: "Read the number of tasks straight from Automate",
      code: `set $ids @get(@gelato:automate() "getTaskIdsByUser(address)(bytes32[])" @me)`,
    },
  ],
});
