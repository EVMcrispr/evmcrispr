import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import { helpers } from "../../../src/_generated";
import { GNO, SOME_ADDRESS, WXDAI } from "../../fixtures";
import { server } from "../../setup";

const HOLDER = "0x1111111111111111111111111111111111111111";
const EMPTY = "0x2222222222222222222222222222222222222222";

const holding = (
  address: string,
  value: string,
  type = "ERC-20",
  extra: Record<string, unknown> = {},
) => ({
  token: {
    address_hash: address,
    symbol: "TKN",
    decimals: "18",
    type,
    ...extra,
  },
  value,
  token_id: null,
  token_instance: null,
});

// Blockscout v2 holdings, as the sdk fetches them: a real ERC-20 mix plus the
// entries the helper must drop — an NFT, a zero balance and a malformed entry.
server.use(
  http.get(
    "https://gnosis.blockscout.com/api/v2/addresses/:address/token-balances",
    ({ params }) => {
      const address = String(params.address).toLowerCase();
      if (address === HOLDER)
        return HttpResponse.json([
          holding(WXDAI.toLowerCase(), "1500000000000000000000"),
          holding(SOME_ADDRESS, "1", "ERC-721"),
          holding(GNO, "42000000000000000000"),
          holding(SOME_ADDRESS, "0"),
          { token: { symbol: "broken" }, value: "5" },
        ]);
      if (address === EMPTY) return HttpResponse.json([]);
      return HttpResponse.json({ message: "Not found" }, { status: 404 });
    },
  ),
);

describeHelper(
  "@token:holdings",
  {
    module: "token",
    cases: [
      {
        name: "should list the fungible tokens with a balance, checksummed, in explorer order",
        input: `@token:holdings(${HOLDER})`,
        validate: (result) => {
          expect(result).to.deep.equal([WXDAI, GNO]);
        },
      },
      {
        name: "should accept an explicit chain",
        input: `@token:holdings(${HOLDER} gnosis)`,
        validate: (result) => {
          expect(result).to.deep.equal([WXDAI, GNO]);
        },
      },
      {
        name: "should return an empty array for an account holding nothing",
        input: `@token:holdings(${EMPTY})`,
        validate: (result) => {
          expect(result).to.deep.equal([]);
        },
      },
    ],
    errorCases: [
      {
        name: "should fail when the explorer cannot answer",
        input: `@token:holdings(${SOME_ADDRESS})`,
        error: "could not list the tokens",
      },
      {
        name: "should fail on a chain without a Blockscout instance",
        input: `@token:holdings(${HOLDER} bsc)`,
        error: "Blockscout",
      },
    ],
    docCases: [
      {
        description: "List the ERC-20 tokens an account holds",
        code: `set $tokens @token:holdings(0x1111111111111111111111111111111111111111)`,
      },
      {
        description: "Look on another chain",
        code: `set $tokens @token:holdings(0x1111111111111111111111111111111111111111 gnosis)`,
      },
    ],
    sampleArgs: [HOLDER, "gnosis"],
  },
  helpers.holdings.argDefs,
);
