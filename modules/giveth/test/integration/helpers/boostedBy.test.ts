import "../../setup";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS } from "../../fixtures";

const validateBoosts = (result: any) => {
  const [slugs, percentages] = result;
  expect(slugs).to.eql(["evmcrispr", "wayback-machine"]);
  expect(percentages.map((p: any) => p.toNumber())).to.eql([70, 30]);
};

describeHelper("@giveth:boostedBy", {
  module: "giveth",
  cases: [
    {
      name: "returns boosted slugs and percentages sorted by percentage, dropping zero boosts",
      input: `@giveth:boostedBy(${TEST_ACCOUNT_ADDRESS})`,
      validate: validateBoosts,
    },
    {
      name: "defaults to the connected account",
      input: "@giveth:boostedBy()",
      validate: validateBoosts,
    },
    {
      name: "returns empty arrays for accounts without a Giveth profile",
      input: `@giveth:boostedBy(${SOME_ADDRESS})`,
      validate: (result) => {
        expect(result).to.eql([[], []]);
      },
    },
  ],
  docCases: [
    {
      description: "Print the projects you are boosting and their percentages",
      code: "print @giveth:boostedBy(@me)",
    },
    {
      description: "Show your boosts as a table",
      code: "print @giveth:boostedBy(@me) --headers [Project Percentage]",
    },
  ],
});
