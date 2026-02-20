import "../../setup";
import { givethDonationRelayer } from "@evmcrispr/module-giveth/addresses";
import {
  createInterpreter,
  describeCommand,
  expect,
  getPublicClient,
} from "@evmcrispr/test-utils";

describeCommand("donate", {
  skip: true,
  describeName: "Giveth > commands > donate <slug> <amount> <token>",
  module: "giveth",
  preamble: "load giveth\nset $token.tokenlist https://tokens.honeyswap.org",
  cases: [
    {
      name: "should return a correct donate action",
      script: "giveth:donate evmcrispr @token.amount(HNY,1) @token(HNY)",
      validate: async (result) => {
        const client = getPublicClient();
        const interpreter2 = createInterpreter(
          `set $token.tokenlist https://tokens.honeyswap.org
        exec @token(HNY) approve(address,uint) ${givethDonationRelayer.get(
          100,
        )} 1e18
        exec ${givethDonationRelayer.get(
          100,
        )} sendDonation(address,address,uint256,uint256) @token(HNY) 0xeafFF6dB1965886348657E79195EB6f1A84657eB 1e18 1350`,
          client,
        );

        const result2 = await interpreter2.interpret();
        expect(result).eql(result2);
      },
    },
  ],
});

describeCommand("donate", {
  describeName: "Giveth > commands > donate > error cases",
  module: "giveth",
  preamble: "load giveth",
  errorCases: [
    {
      name: "should fail when the project is not found",
      script:
        "giveth:donate nonexistent-project-slug-xyz 1e18 0x0000000000000000000000000000000000000001",
      error: "Project not found",
    },
  ],
});
