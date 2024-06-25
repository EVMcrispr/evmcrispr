import { expect } from "chai";
import type { Signer } from "ethers";
import { ethers } from "hardhat";

import { givethDonationRelayer } from "../../../../src/modules/giveth/addresses";

import { createInterpreter } from "../../../test-helpers/cas11";

describe("Giveth > commands > donate <slug> <amount> <token>", () => {
  let signer: Signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it("should return a correct donate action", async () => {
    const interpreter = createInterpreter(
      `
          load giveth
          set $token.tokenlist https://tokens.honeyswap.org
          giveth:donate evmcrispr @token.amount(HNY,1) @token(HNY)`,
      signer,
    );

    const interpreter2 = createInterpreter(
      `set $token.tokenlist https://tokens.honeyswap.org
        exec @token(HNY) approve(address,uint) ${givethDonationRelayer.get(
          100,
        )} 1e18
        exec ${givethDonationRelayer.get(
          100,
        )} sendDonation(address,address,uint256,uint256) @token(HNY) 0xeafFF6dB1965886348657E79195EB6f1A84657eB 1e18 1350`,
      signer,
    );

    const result = await interpreter.interpret();
    const result2 = await interpreter2.interpret();

    expect(result).eql(result2);
  });
});
