import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";

import { givethDonationRelayer } from "@evmcrispr/module-giveth/addresses";
import type { PublicClient } from "viem";
import { getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "../../test-helpers/evml";

describe.skip("Giveth > commands > donate <slug> <amount> <token>", () => {
  let client: PublicClient;

  beforeAll(async () => {
    client = getPublicClient();
  });

  it("should return a correct donate action", async () => {
    const interpreter = createInterpreter(
      `
          load giveth
          set $token.tokenlist https://tokens.honeyswap.org
          giveth:donate evmcrispr @token.amount(HNY,1) @token(HNY)`,
      client,
    );

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

    const result = await interpreter.interpret();
    const result2 = await interpreter2.interpret();

    expect(result).eql(result2);
  });
});
