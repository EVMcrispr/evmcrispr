import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  selectorOf,
  word,
} from "@evmcrispr/test-utils/evml";
import { getAddress, keccak256, stringToHex, toFunctionSelector } from "viem";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");
const TARGET = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const MANAGER = getAddress("0xa111111111111111111111111111111111111111");
const ACCOUNT = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
const OP_ID =
  "0x0102030405060708091011121314151617181920212223242526272829303132";

const preamble = `load assertions\nload acl\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

/** Validate a param as pick(word) over a direct staticcall and return
 *  the inner call. */
function pickedCall(param: DecodedParam, wordIndex: bigint) {
  const pick = d.core(param);
  expect(pick.functionName).to.equal("pick");
  expect(pick.args[1]).to.equal(wordIndex);
  return d.staticCallOf(pick.args[0] as unknown as DecodedParam);
}

describeCommand("assert (acl on-chain faces)", {
  describeName: "Acl > helpers > on-chain faces",
  preamble,
  cases: [
    {
      name: "compiles @owner! to a direct owner() staticcall",
      script: `assertions:assert @owner!(${TARGET}) == ${ACCOUNT} "owner rotated"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(TARGET);
        expect(call.data).to.equal(selectorOf("owner()"));
        d.expectConstraint(param, "Eq", BigInt(ACCOUNT));
      },
    },
    {
      name: "compiles @pendingOwner! to a direct pendingOwner() staticcall",
      script: `assertions:assert @pendingOwner!(${TARGET}) == 0x0000000000000000000000000000000000000000`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        expect(d.staticCallOf(param).data).to.equal(
          selectorOf("pendingOwner()"),
        );
        d.expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "compiles @defaultAdmin! and @defaultAdminDelay! to direct reads",
      script: `assertions:assert @bool!((@defaultAdmin!(${TARGET}) == ${ACCOUNT}) and (@defaultAdminDelay!(${TARGET}) >= 3600))`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a, b } = d.expectOpJudge(param, "bitAnd(uint256,uint256)");
        const eqArgs = d.opReadOf(a, "eq(uint256,uint256)");
        expect(d.staticCallOf(eqArgs[0]).data).to.equal(
          selectorOf("defaultAdmin()"),
        );
        const geArgs = d.opReadOf(b, "ge(uint256,uint256)");
        expect(d.staticCallOf(geArgs[0]).data).to.equal(
          selectorOf("defaultAdminDelay()"),
        );
      },
    },
    {
      name: "unwraps the @pendingDefaultAdmin! pair through pick word 0",
      script: `assertions:assert @pendingDefaultAdmin!(${TARGET}) == 0x0000000000000000000000000000000000000000 "transfer pending"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = pickedCall(param, 0n);
        expect(call.target).to.equal(TARGET);
        expect(call.data).to.equal(selectorOf("pendingDefaultAdmin()"));
        d.expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "hashes AccessControl role names at composition time in @hasRole!",
      script: `assertions:assert @hasRole!(${TARGET} MINTER_ROLE ${ACCOUNT})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(TARGET);
        expect(call.data).to.equal(
          `${selectorOf("hasRole(bytes32,address)")}${keccak256(stringToHex("MINTER_ROLE")).slice(2)}${word(BigInt(ACCOUNT)).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "routes numeric roles through the AccessManager overload with pick 0",
      script: `assertions:assert @hasRole!(${MANAGER} 1 ${ACCOUNT}) == true`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = pickedCall(param, 0n);
        expect(call.target).to.equal(MANAGER);
        expect(call.data).to.equal(
          `${selectorOf("hasRole(uint64,address)")}${word(1n).slice(2)}${word(BigInt(ACCOUNT)).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "compiles @roleAdmin! for AccessControl roles as a bytes32 read",
      script: `assertions:assert @roleAdmin!(${TARGET} MINTER_ROLE) == 0x0000000000000000000000000000000000000000000000000000000000000000`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.data).to.equal(
          `${selectorOf("getRoleAdmin(bytes32)")}${keccak256(stringToHex("MINTER_ROLE")).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "compiles @roleAdmin! for AccessManager role ids as a uint read",
      script: `assertions:assert @roleAdmin!(${MANAGER} 7) == 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.data).to.equal(
          `${selectorOf("getRoleAdmin(uint64)")}${word(7n).slice(2)}`,
        );
      },
    },
    {
      name: "compiles @canCall! with the composition-time selector and pick 0",
      script: `assertions:assert @canCall!(${MANAGER} ${ACCOUNT} ${TARGET} "mint(address,uint256)")`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = pickedCall(param, 0n);
        expect(call.target).to.equal(MANAGER);
        const selector = toFunctionSelector("function mint(address,uint256)");
        expect(call.data).to.equal(
          `${selectorOf("canCall(address,address,bytes4)")}${word(BigInt(ACCOUNT)).slice(2)}${word(BigInt(TARGET)).slice(2)}${selector.slice(2)}${"0".repeat(56)}`,
        );
        d.expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "compiles @operationSchedule! of an @operationId! read",
      script: `assertions:assert @operationSchedule!(${MANAGER} ${OP_ID}) == 0 "still scheduled"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(MANAGER);
        expect(call.data).to.equal(
          `${selectorOf("getSchedule(bytes32)")}${OP_ID.slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "compiles @operationId! to a hashOperation read",
      script: `assertions:assert @operationId!(${MANAGER} ${ACCOUNT} ${TARGET} "pause()") != 0x0000000000000000000000000000000000000000000000000000000000000000`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a, b } = d.expectOpJudge(param, "ne(uint256,uint256)");
        const call = d.staticCallOf(a);
        expect(call.target).to.equal(MANAGER);
        expect(
          call.data.startsWith(
            selectorOf("hashOperation(address,address,bytes)"),
          ),
        ).to.be.true;
        d.expectRawWord(b, 0n);
      },
    },
  ],
});
