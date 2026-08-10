import "../../setup";
import { CORE_ADDRESS, OPERATORS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
  selectorOf,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATORS = getAddress(OPERATORS_ADDRESS);
const WXDAI = getAddress("0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d");
const FACTORY = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

const preamble = `load contracts\nload lang`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (@contracts:codeAt!)", {
  describeName: "Contracts > helpers > codeAt on-chain face",
  preamble,
  cases: [
    {
      name: "reads code at assertion time through the code operator",
      script: `assert @lang:bytes.len!(@contracts:codeAt!(${WXDAI})) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const len = d.opReadOf(param, "byteLen(bytes)");
        const args = d.opReadOf(len[0], "code(address)");
        expect(args).to.have.lengthOf(1);
        d.expectRawWord(args[0], BigInt(WXDAI));
      },
    },
    {
      name: "takes a live address, so a predicted deployment can be checked",
      script: `assert @lang:bytes.len!(@contracts:codeAt!(${FACTORY}::{predicted()(address)})) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const len = d.opReadOf(param, "byteLen(bytes)");
        const args = d.opReadOf(len[0], "code(address)");
        // The address is itself a read, not a literal.
        const call = d.staticCallOf(args[0]);
        expect(call.target).to.equal(FACTORY);
        expect(call.data).to.equal(selectorOf("predicted()"));
      },
    },
  ],
});
