import "../../setup";
import {
  CORE_ADDRESS,
  OPERATORS_ADDRESS,
  PAYLOAD_STEP,
} from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  word,
} from "@evmcrispr/test-utils/evml";
import { getAddress, toFunctionSelector } from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATORS = getAddress(OPERATORS_ADDRESS);
const QUEUE = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const TRANSFER_SELECTOR = BigInt(
  toFunctionSelector("function transfer(address,uint256)"),
);

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (@abi.decodeCall! calldata shape)", {
  describeName: "Std > helpers > @abi.decodeCall! on-chain shape",
  cases: [
    {
      // cond(guard, selection, selection): the guard is shr(pick(data, 2),
      // 224) carrying an EQ selector constraint, and both branches carry
      // the same selection — the constraint does the judging. The selection
      // slices the selector off with a live length, re-enters through
      // PAYLOAD, and picks the statically-positioned amount word.
      name: "compiles to a selector-guarded cond over a PAYLOAD re-entry",
      script: `assert @abi.decodeCall!(${QUEUE}::{queuedCalldata()(bytes)} transfer(address,uint256) [_ $]) == 42`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const cond = d.core(param);
        expect(cond.functionName).to.equal("cond");
        const [guard, then_, else_] = cond.args as unknown as DecodedParam[];

        // the guard: shr(pick(data, 2), 224) judged EQ the selector
        expect(guard.constraints).to.have.lengthOf(1);
        expect(BigInt(guard.constraints[0].referenceData)).to.equal(
          TRANSFER_SELECTOR,
        );
        const shrArgs = d.opReadOf(guard, "shr(uint256,uint256)");
        expect(shrArgs).to.have.lengthOf(2);
        const pick = d.core(shrArgs[0]);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(2n);
        expect(shrArgs[1].paramData).to.equal(`0x${word(224n).slice(2)}`);

        // both branches carry the same selection
        expect(then_).to.deep.equal(else_);

        // the selection: pick(navPayload(slice(data, 4, len - 4)), 1)
        const sel = d.core(then_);
        expect(sel.functionName).to.equal("pick");
        expect(sel.args[1]).to.equal(1n);
        const strip = d.core(sel.args[0] as unknown as DecodedParam);
        expect(strip.functionName).to.equal("nav");
        expect(strip.args[1]).to.equal("(bytes)");
        expect(strip.args[2]).to.deep.equal([0n, PAYLOAD_STEP]);
        const sliceSegs = d.opReadOf(
          strip.args[0] as unknown as DecodedParam,
          "slice(bytes,uint256,uint256)",
        );
        // heads: [offset_data = 96][start = 68], then the live length,
        // the synthesized total, and the calldata envelope
        expect(sliceSegs[0].paramData).to.equal(
          `0x${word(96n).slice(2)}${word(68n).slice(2)}`,
        );
        expect(sliceSegs).to.have.lengthOf(4);

        d.expectConstraint(param, "Eq", 42n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a signature-less on-chain decodeCall",
      script: `assert @abi.decodeCall!(${QUEUE}::{queuedCalldata()(bytes)} [_ $]) == 1`,
      error: "function signature",
    },
  ],
});
