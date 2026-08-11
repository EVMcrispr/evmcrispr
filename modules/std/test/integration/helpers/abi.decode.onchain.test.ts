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
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATORS = getAddress(OPERATORS_ADDRESS);
const ORACLE = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (@abi.decode! calldata shape)", {
  describeName: "Std > helpers > @abi.decode! on-chain shape",
  preamble: "load lang",
  cases: [
    {
      // The blob lens keeps its own nav and the PAYLOAD sentinel appends to
      // that path — the strip costs no extra frame. The claimed word at a
      // static head position rides the cheaper raw pick.
      name: "appends PAYLOAD to the reaching nav; static words pick",
      script: `assert @abi.decode!("address,uint256" ${ORACLE}::{lastReport()(uint256,bytes)}[_ $] [_ $]) == 42`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const outer = d.core(param);
        expect(outer.functionName).to.equal("pick");
        expect(outer.args[1]).to.equal(1n);
        const inner = d.core(outer.args[0] as unknown as DecodedParam);
        expect(inner.functionName).to.equal("nav");
        expect(inner.args[1]).to.equal("(uint256,bytes)");
        expect(inner.args[2]).to.deep.equal([1n, PAYLOAD_STEP]);
        expect(
          d.staticCallOf(inner.args[0] as unknown as DecodedParam).target,
        ).to.equal(ORACLE);
        d.expectConstraint(param, "Eq", 42n);
      },
    },
    {
      // A single bytes return re-enters through path [0, PAYLOAD]; a
      // dynamic selection out of the claim stays a nav whose descriptor is
      // the claimed type list, and the string result composes with the
      // bytes faces like any other string value.
      name: "a dynamic selection navs the claimed types over the payload",
      script: `assert @bytes.len!(@abi.decode!("uint256,string" ${ORACLE}::{note()(bytes)} [_ $])) == 5`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const lenArgs = d.opReadOf(param, "byteLen(bytes)");
        expect(lenArgs).to.have.lengthOf(1);
        const outer = d.core(lenArgs[0]);
        expect(outer.functionName).to.equal("nav");
        expect(outer.args[1]).to.equal("(uint256,string)");
        expect(outer.args[2]).to.deep.equal([1n]);
        const inner = d.core(outer.args[0] as unknown as DecodedParam);
        expect(inner.functionName).to.equal("nav");
        expect(inner.args[1]).to.equal("(bytes)");
        expect(inner.args[2]).to.deep.equal([0n, PAYLOAD_STEP]);
        d.expectConstraint(param, "Eq", 5n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a lens-less on-chain decode",
      script: `assert @abi.decode!("uint256" ${ORACLE}::{note()(bytes)}) == 1`,
      error: "needs a lens",
    },
  ],
});
