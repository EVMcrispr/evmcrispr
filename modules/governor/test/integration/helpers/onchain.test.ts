import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  selectorOf,
  word,
} from "@evmcrispr/test-utils/evml";
import {
  decodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
  stringToHex,
} from "viem";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");
const GOVERNOR = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const TIMELOCK = getAddress("0xa111111111111111111111111111111111111111");
const TARGET = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");

const preamble = `load assertions\nload governor\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

const proposalAbi = parseAbi([
  "function getProposalId(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) view returns (uint256)",
  "function hashProposal(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) view returns (uint256)",
]);

describeCommand("assert (governor on-chain faces)", {
  describeName: "Governor > helpers > on-chain faces",
  preamble,
  cases: [
    {
      name: "compiles @timelockMinDelay! to a direct getMinDelay() staticcall",
      script: `assertions:assert @timelockMinDelay!(${TIMELOCK}) >= 3600 "delay lowered"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(TIMELOCK);
        expect(call.data).to.equal(selectorOf("getMinDelay()"));
        d.expectConstraint(param, "Gte", 3600n);
      },
    },
    {
      name: "compiles @proposalState! to the raw uint8 enum read",
      script: `assertions:assert @proposalState!(${GOVERNOR} 123) == 4 "proposal not succeeded"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(GOVERNOR);
        expect(call.data).to.equal(
          `${selectorOf("state(uint256)")}${word(123n).slice(2)}`,
        );
        // Succeeded = 4 as the raw enum word; the string mapping stays
        // off-chain.
        d.expectConstraint(param, "Eq", 4n);
      },
    },
    {
      name: "compiles @timelockOperationState! to nested conds over the state views",
      script: `assertions:assert @timelockOperationState!(${TIMELOCK} 0x83f6db63dbcae7ea6a625e442c00b74a4707ce6c4a91667c8b5cf01b6f3159a1) == 2 "not ready"`,
      validate: (actions) => {
        const OP_ID =
          "83f6db63dbcae7ea6a625e442c00b74a4707ce6c4a91667c8b5cf01b6f3159a1";
        const { param } = d.decodeAssert(actions);
        // OZ's numeric OperationState: Ready = 2 (the string names stay
        // off-chain).
        d.expectConstraint(param, "Eq", 2n);
        // cond(done, 3, cond(ready, 2, cond(pending, 1, 0)))
        const expectView = (c: DecodedParam, view: string) => {
          const call = d.staticCallOf(c);
          expect(call.target).to.equal(TIMELOCK);
          expect(call.data).to.equal(
            `${selectorOf(`${view}(bytes32)`)}${OP_ID}`,
          );
        };
        const outer = d.core(param);
        expect(outer.functionName).to.equal("cond");
        const [done, three, midParam] = outer.args as unknown as [
          DecodedParam,
          DecodedParam,
          DecodedParam,
        ];
        expectView(done, "isOperationDone");
        d.expectRawWord(three, 3n);
        const middle = d.core(midParam);
        expect(middle.functionName).to.equal("cond");
        const [ready, two, innerParam] = middle.args as unknown as [
          DecodedParam,
          DecodedParam,
          DecodedParam,
        ];
        expectView(ready, "isOperationReady");
        d.expectRawWord(two, 2n);
        const inner = d.core(innerParam);
        expect(inner.functionName).to.equal("cond");
        const [pending, one, zero] = inner.args as unknown as [
          DecodedParam,
          DecodedParam,
          DecodedParam,
        ];
        expectView(pending, "isOperationPending");
        d.expectRawWord(one, 1n);
        d.expectRawWord(zero, 0n);
      },
    },
    {
      name: "compiles @proposalId! to orElse(getProposalId, hashProposal)",
      script: `assertions:assert @proposalId!(${GOVERNOR} [${TARGET}] [0] [0x12345678] "do the thing") != 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a, b } = d.expectOpJudge(param, "ne(uint256,uint256)");
        d.expectRawWord(b, 0n);
        const orElse = d.core(a);
        expect(orElse.functionName).to.equal("orElse");
        const primary = d.staticCallOf(
          orElse.args[0] as unknown as DecodedParam,
        );
        const fallback = d.staticCallOf(
          orElse.args[1] as unknown as DecodedParam,
        );
        expect(primary.target).to.equal(GOVERNOR);
        expect(fallback.target).to.equal(GOVERNOR);
        for (const [data, fn] of [
          [primary.data, "getProposalId"],
          [fallback.data, "hashProposal"],
        ] as const) {
          const decoded = decodeFunctionData({ abi: proposalAbi, data });
          expect(decoded.functionName).to.equal(fn);
          expect(decoded.args[0]).to.deep.equal([TARGET]);
          expect(decoded.args[1]).to.deep.equal([0n]);
          expect(decoded.args[2]).to.deep.equal(["0x12345678"]);
          expect(decoded.args[3]).to.equal(
            keccak256(stringToHex("do the thing")),
          );
        }
      },
    },
  ],
});
