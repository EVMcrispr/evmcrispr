import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  selectorOf,
  word,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");
const VAULT = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const OWNER = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
const OPERATOR = getAddress("0xa111111111111111111111111111111111111111");

const preamble = `load assertions\nload vault\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (vault on-chain faces)", {
  describeName: "Vault > helpers > on-chain faces",
  preamble,
  cases: [
    {
      name: "compiles @asset! to a direct asset() staticcall",
      script: `assertions:assert @asset!(${VAULT}) == ${OWNER} "asset changed"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(VAULT);
        expect(call.data).to.equal(selectorOf("asset()"));
        d.expectConstraint(param, "Eq", BigInt(OWNER));
      },
    },
    {
      name: "compiles @share! to orElse(share(), vault) for plain 4626 fallback",
      script: `assertions:assert @share!(${VAULT}) == ${VAULT}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const orElse = d.core(param);
        expect(orElse.functionName).to.equal("orElse");
        const primary = d.staticCallOf(
          orElse.args[0] as unknown as DecodedParam,
        );
        expect(primary.target).to.equal(VAULT);
        expect(primary.data).to.equal(selectorOf("share()"));
        d.expectRawWord(
          orElse.args[1] as unknown as DecodedParam,
          BigInt(VAULT),
        );
      },
    },
    {
      name: "compiles @totalAssets! to a direct staticcall",
      script: `assertions:assert @totalAssets!(${VAULT}) >= 1e18`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        expect(d.staticCallOf(param).data).to.equal(
          selectorOf("totalAssets()"),
        );
        d.expectConstraint(param, "Gte", 10n ** 18n);
      },
    },
    {
      name: "compiles @convertToAssets! with a literal amount to plain calldata",
      script: `assertions:assert @convertToAssets!(${VAULT} 100) >= 100`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.data).to.equal(
          `${selectorOf("convertToAssets(uint256)")}${word(100n).slice(2)}`,
        );
      },
    },
    {
      name: "folds a live @convertToShares! amount into a core read splice",
      script: `assertions:assert @convertToShares!(${VAULT} ${VAULT}::{totalAssets()(uint256)}) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { target, selector, segments } = d.readOf(param);
        d.expectRawWord(target, BigInt(VAULT));
        expect(selector).to.equal(selectorOf("convertToShares(uint256)"));
        expect(segments).to.have.lengthOf(1);
        expect(d.staticCallOf(segments[0]).target).to.equal(VAULT);
      },
    },
    {
      name: "compiles @maxWithdraw! with an explicit owner",
      script: `assertions:assert @maxWithdraw!(${VAULT} ${OWNER}) > 0 "nothing to withdraw"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.data).to.equal(
          `${selectorOf("maxWithdraw(address)")}${word(BigInt(OWNER)).slice(2)}`,
        );
        d.expectConstraint(param, "Gte", 1n);
      },
    },
    {
      name: "orders @isOperator! calldata as isOperator(controller, operator)",
      script: `assertions:assert @isOperator!(${VAULT} ${OPERATOR} ${OWNER}) == false`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.data).to.equal(
          `${selectorOf("isOperator(address,address)")}${word(BigInt(OWNER)).slice(2)}${word(BigInt(OPERATOR)).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "orders @pendingDeposit! calldata as pendingDepositRequest(requestId, controller)",
      script: `assertions:assert @pendingDeposit!(${VAULT} ${OWNER} 3) == 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.data).to.equal(
          `${selectorOf("pendingDepositRequest(uint256,address)")}${word(3n).slice(2)}${word(BigInt(OWNER)).slice(2)}`,
        );
      },
    },
    {
      name: "defaults the @claimableRedeem! request id to 0",
      script: `assertions:assert @claimableRedeem!(${VAULT} ${OWNER}) == 0 "claim pending"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.data).to.equal(
          `${selectorOf("claimableRedeemRequest(uint256,address)")}${word(0n).slice(2)}${word(BigInt(OWNER)).slice(2)}`,
        );
      },
    },
    {
      name: "compiles @pendingRedeem! and @claimableDeposit! reads",
      script: `assertions:assert @num!(@pendingRedeem!(${VAULT} ${OWNER}) + @claimableDeposit!(${VAULT} ${OWNER})) == 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "add(uint256,uint256)");
        expect(
          d
            .staticCallOf(args[0])
            .data.startsWith(
              selectorOf("pendingRedeemRequest(uint256,address)"),
            ),
        ).to.be.true;
        expect(
          d
            .staticCallOf(args[1])
            .data.startsWith(
              selectorOf("claimableDepositRequest(uint256,address)"),
            ),
        ).to.be.true;
      },
    },
  ],
});
