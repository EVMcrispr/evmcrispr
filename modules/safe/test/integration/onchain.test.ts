import "../setup";
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
const SAFE = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const OWNER = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
// keccak256("guard_manager.guard.address")
const GUARD_SLOT =
  "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";

const preamble = `load assertions\nload safe\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (safe on-chain faces)", {
  describeName: "Safe > helpers > on-chain faces",
  preamble,
  cases: [
    {
      name: "compiles @threshold! to a direct getThreshold() staticcall",
      script: `assertions:assert @safe:threshold!(${SAFE}) >= 3 "threshold lowered"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(SAFE);
        expect(call.data).to.equal(selectorOf("getThreshold()"));
        d.expectConstraint(param, "Gte", 3n);
      },
    },
    {
      name: "compiles @nonce! to a direct nonce() staticcall",
      script: `assertions:assert @safe:nonce!(${SAFE}) == 42 "nonce moved"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(SAFE);
        expect(call.data).to.equal(selectorOf("nonce()"));
        d.expectConstraint(param, "Eq", 42n);
      },
    },
    {
      name: "compiles @isOwner! to the Safe's own isOwner(address) view",
      script: `assertions:assert @safe:isOwner!(${OWNER} ${SAFE})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(SAFE);
        expect(call.data).to.equal(
          `${selectorOf("isOwner(address)")}${word(BigInt(OWNER)).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "reads the @guard! slot through getStorageAt with pick word 2",
      script: `assertions:assert @safe:guard!(${SAFE}) == 0x0000000000000000000000000000000000000000 "guard installed"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const pick = d.core(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(2n);
        const call = d.staticCallOf(pick.args[0] as unknown as DecodedParam);
        expect(call.target).to.equal(SAFE);
        expect(call.data).to.equal(
          `${selectorOf("getStorageAt(uint256,uint256)")}${GUARD_SLOT.slice(2)}${word(1n).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 0n);
      },
    },
  ],
});
