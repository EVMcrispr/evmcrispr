import "../../setup";
import { describeParity } from "@evmcrispr/test-utils/onchain";
import { helpers } from "../../../src/_generated";

/** WXDAI and DAI on Gnosis: both real ERC-20s at the fork block. */
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const DAI = "0x44fA8E6f47987339850636F88629646662444217";
/** A holder with a non-zero balance, so an allowance read has a real owner. */
const HOLDER = "0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533";
const SPENDER = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";

describeParity("@token", {
  module: "token [@decimals @totalSupply @symbol @allowance @amount]",
  helpers,
  cases: [
    {
      name: "decimals of a live token",
      run: `@decimals(${WXDAI})`,
      compile: `@decimals!(${WXDAI})`,
    },
    {
      name: "totalSupply of a live token",
      run: `@totalSupply(${WXDAI})`,
      compile: `@totalSupply!(${WXDAI})`,
    },
    {
      name: "symbol of a live token, judged as a string",
      run: `@symbol(${DAI})`,
      compile: `@symbol!(${DAI})`,
    },
    {
      name: "allowance between two accounts",
      run: `@allowance(${WXDAI} ${HOLDER} ${SPENDER})`,
      compile: `@allowance!(${WXDAI} ${HOLDER} ${SPENDER})`,
    },
    {
      // The on-chain face scales against a LIVE decimals() read rather than
      // a build-time constant, so this pins that the two agree on a token
      // whose decimals the off-chain face resolved at composition time.
      name: "amount scaled by the token's decimals",
      run: `@amount(${WXDAI} 1.5)`,
      compile: `@amount!(${WXDAI} 1.5)`,
    },
  ],
});
