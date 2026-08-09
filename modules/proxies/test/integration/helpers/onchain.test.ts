import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  selectorOf,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");
const PROXY = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const LOGIC = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");

const preamble = `load assertions\nload proxies\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (@implementation!)", {
  describeName: "Proxies > helpers > @implementation!",
  preamble,
  cases: [
    {
      name: "compiles to orElse(implementation(), beacon() -> implementation())",
      script: `assertions:assert @implementation!(${PROXY}) == ${LOGIC} "implementation changed"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const orElse = d.core(param);
        expect(orElse.functionName).to.equal("orElse");
        // Primary: a direct implementation() call on the proxy.
        const direct = d.staticCallOf(
          orElse.args[0] as unknown as DecodedParam,
        );
        expect(direct.target).to.equal(PROXY);
        expect(direct.data).to.equal(selectorOf("implementation()"));
        // Fallback: the beacon hop through the core chain.
        const chain = d.core(orElse.args[1] as unknown as DecodedParam);
        expect(chain.functionName).to.equal("chain");
        d.expectRawWord(
          chain.args[0] as unknown as DecodedParam,
          BigInt(PROXY),
        );
        expect(chain.args[1]).to.deep.equal([
          selectorOf("beacon()"),
          selectorOf("implementation()"),
        ]);
        d.expectConstraint(param, "Eq", BigInt(LOGIC));
      },
    },
  ],
});
