import "../../setup";
import { CORE_ADDRESS, OPERATORS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
  selectorOf,
  word,
} from "@evmcrispr/test-utils/evml";
import { getAddress, labelhash, namehash } from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATORS = getAddress(OPERATORS_ADDRESS);
const REGISTRY = getAddress("0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e");
const NAME_WRAPPER = getAddress("0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401");
const BASE_REGISTRAR = getAddress("0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85");
const CONTROLLER = getAddress("0x59E16fcCd424Cc24e280Be16E11Bcd56fb0CE547");
const NAME = "vitalik.eth";

const preamble = `load ens`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

const NODE = namehash(NAME);

describeCommand("assert (ens registry faces)", {
  describeName: "Ens > helpers > registry on-chain faces",
  // The ENS on-chain faces are mainnet-only: an assertion reads the chain it
  // runs on, and ENS cannot be reached from anywhere else. The suites default
  // to gnosis, so start this one on mainnet.
  chainId: 1,
  preamble,
  cases: [
    {
      name: "reads the resolver straight off the registry",
      script: `assert @ens:resolver!(${NAME}) != 0x0000000000000000000000000000000000000000`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a } = d.expectOpJudge(param, "ne(uint256,uint256)");
        const call = d.staticCallOf(a);
        expect(call.target).to.equal(REGISTRY);
        expect(call.data).to.equal(
          `${selectorOf("resolver(bytes32)")}${NODE.slice(2)}`,
        );
      },
    },
    {
      name: "unwraps a wrapped owner through a cond",
      script: `assert @ens:owner!(${NAME}) == 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const cond = d.core(param);
        expect(cond.functionName).to.equal("cond");
        // The condition asks whether the registry owner IS the wrapper.
        const eqArgs = d.opReadOf(cond.args[0] as never, "eq(uint256,uint256)");
        const registryOwner = d.staticCallOf(eqArgs[0]);
        expect(registryOwner.target).to.equal(REGISTRY);
        expect(registryOwner.data).to.equal(
          `${selectorOf("owner(bytes32)")}${NODE.slice(2)}`,
        );
        d.expectRawWord(eqArgs[1], BigInt(NAME_WRAPPER));

        // Then branch: the ERC-1155 holder of the wrapped name.
        const wrapped = d.staticCallOf(cond.args[1] as never);
        expect(wrapped.target).to.equal(NAME_WRAPPER);
        expect(wrapped.data).to.equal(
          `${selectorOf("ownerOf(uint256)")}${NODE.slice(2)}`,
        );
        // Else branch: the registry owner as read.
        expect(d.staticCallOf(cond.args[2] as never).target).to.equal(REGISTRY);
      },
    },
    {
      name: "reads the expiry off the base registrar by labelhash",
      script: `assert @ens:expiry!(${NAME}) > 1700000000`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(BASE_REGISTRAR);
        expect(call.data).to.equal(
          `${selectorOf("nameExpires(uint256)")}${word(BigInt(labelhash("vitalik"))).slice(2)}`,
        );
        d.expectConstraint(param, "Gte", 1700000001n);
      },
    },
    {
      name: "asks the controller whether a label is available",
      script: `assert @ens:available!(${NAME}) == false`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(CONTROLLER);
        expect(call.data.startsWith(selectorOf("available(string)"))).to.be
          .true;
        // A bool read judged directly: false is EQ 0.
        d.expectConstraint(param, "Eq", 0n);
      },
    },
  ],
});

// The refusal itself is a user-visible property, so pin the message rather
// than only testing the mainnet happy path. This is the whole reason the
// helpers carry a compileDescription.
describeCommand("assert (ens off mainnet)", {
  describeName: "Ens > helpers > registry on-chain faces off mainnet",
  preamble,
  errorCases: [
    {
      name: "refuses @ens:owner! on a chain ENS cannot be read from",
      script: `assert @ens:owner!(${NAME}) != 0x0000000000000000000000000000000000000000`,
      error: /has no on-chain face on .*use the off-chain @ens: face/is,
    },
  ],
});
