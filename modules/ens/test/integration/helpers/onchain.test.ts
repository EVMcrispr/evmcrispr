import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  selectorOf,
} from "@evmcrispr/test-utils/evml";
import { getAddress, namehash } from "viem";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");
// The mainnet ENS registry literal (the test chain has no registry).
const REGISTRY = getAddress("0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e");
const VITALIK = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
const NODE = namehash("vitalik.eth");

const preamble = `load assertions\nload ens\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (@addr!)", {
  describeName: "Ens > helpers > @addr!",
  preamble,
  cases: [
    {
      name: "compiles to cond(resolver unset, zero, resolver -> addr chain)",
      script: `assertions:assert @addr!("vitalik.eth") == ${VITALIK} "name moved"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const cond = d.core(param);
        expect(cond.functionName).to.equal("cond");
        // c: eq(resolver(node), 0)
        const eqArgs = d.opReadOf(
          cond.args[0] as unknown as DecodedParam,
          "eq(uint256,uint256)",
        );
        const resolverCall = d.staticCallOf(eqArgs[0]);
        expect(resolverCall.target).to.equal(REGISTRY);
        expect(resolverCall.data).to.equal(
          `${selectorOf("resolver(bytes32)")}${NODE.slice(2)}`,
        );
        d.expectRawWord(eqArgs[1], 0n);
        // then: the zero word
        d.expectRawWord(cond.args[1] as unknown as DecodedParam, 0n);
        // else: chain(resolver(node), [addr(node)])
        const chain = d.core(cond.args[2] as unknown as DecodedParam);
        expect(chain.functionName).to.equal("chain");
        const start = d.staticCallOf(chain.args[0] as unknown as DecodedParam);
        expect(start.target).to.equal(REGISTRY);
        expect(chain.args[1]).to.deep.equal([
          `${selectorOf("addr(bytes32)")}${NODE.slice(2)}`,
        ]);
        d.expectConstraint(param, "Eq", BigInt(VITALIK));
      },
    },
    {
      name: "keeps the ENSIP-15 normalization at composition time",
      script: `assertions:assert @addr!("ViTaLiK.eth") == ${VITALIK}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const cond = d.core(param);
        const eqArgs = d.opReadOf(
          cond.args[0] as unknown as DecodedParam,
          "eq(uint256,uint256)",
        );
        expect(d.staticCallOf(eqArgs[0]).data).to.equal(
          `${selectorOf("resolver(bytes32)")}${NODE.slice(2)}`,
        );
      },
    },
  ],
  errorCases: [
    {
      name: "keeps coin-typed resolution off-chain",
      script: `assertions:assert @addr!("vitalik.eth" 0) == ${VITALIK}`,
      error: "coin-typed resolution stays off-chain",
    },
  ],
});
