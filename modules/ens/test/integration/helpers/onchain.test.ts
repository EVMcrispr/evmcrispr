import "../../setup";
import { CORE_ADDRESS, OPERATIONS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
  selectorOf,
  word,
} from "@evmcrispr/test-utils/evml";
import {
  encodeFunctionData,
  getAddress,
  labelhash,
  namehash,
  parseAbi,
} from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATIONS = getAddress(OPERATIONS_ADDRESS);
const REGISTRY = getAddress("0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e");
const NAME_WRAPPER = getAddress("0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401");
const BASE_REGISTRAR = getAddress("0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85");
/** ENSv2's ETHRegistrar: the only registrar since ENSv2. */
const ETH_REGISTRAR = getAddress("0xD6D8369e55c94Ae8AFA714E6cF7AB5bE54D5CC81");
const NAME = "vitalik.eth";

const preamble = `load ens`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATIONS,
});

const NODE = namehash(NAME);
/** ENSv2's ETHRegistry, where a .eth name is read once it is on ENSv2. */
const ETH_REGISTRY = getAddress("0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2");
const ID = word(BigInt(labelhash("vitalik"))).slice(2);

/** A registry face reads a name where it is when the assertion is judged:
 *  cond(ETHRegistry.getStatus(id) == REGISTERED, the ENSv2 read, the ENS
 *  v1 read). Checks the condition and the ENSv2 read; returns the v1 one. */
function expectV2OrV1(param: unknown, v2Data: string) {
  const cond = d.core(param as never);
  expect(cond.functionName).to.equal("cond");
  const [status, registered] = d.opReadOf(
    cond.args[0] as never,
    "eq(uint256,uint256)",
  );
  const statusCall = d.staticCallOf(status);
  expect(statusCall.target).to.equal(ETH_REGISTRY);
  expect(statusCall.data).to.equal(`${selectorOf("getStatus(uint256)")}${ID}`);
  d.expectRawWord(registered, 2n);
  const v2 = d.staticCallOf(cond.args[1] as never);
  expect(v2.target).to.equal(ETH_REGISTRY);
  expect(v2.data).to.equal(v2Data);
  return cond.args[2];
}

describeCommand("assert (ens registry faces)", {
  describeName: "Ens > helpers > registry on-chain faces",
  // The ENS on-chain faces are mainnet-only: an assertion reads the chain it
  // runs on, and ENS cannot be reached from anywhere else. The suites default
  // to gnosis, so start this one on mainnet.
  chainId: 1,
  preamble,
  cases: [
    {
      name: "reads the resolver off the ENSv2 registry, or the v1 registry for a v1 name",
      script: `assert @ens:resolver!(${NAME}) != 0x0000000000000000000000000000000000000000`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a } = d.expectOpJudge(param, "ne(uint256,uint256)");
        const v1 = expectV2OrV1(
          a,
          encodeFunctionData({
            abi: parseAbi([
              "function getResolver(string) view returns (address)",
            ]),
            functionName: "getResolver",
            args: ["vitalik"],
          }),
        );
        const call = d.staticCallOf(v1 as never);
        expect(call.target).to.equal(REGISTRY);
        expect(call.data).to.equal(
          `${selectorOf("resolver(bytes32)")}${NODE.slice(2)}`,
        );
      },
    },
    {
      name: "reads the owner on ENSv2, or unwraps a wrapped v1 owner through a cond",
      script: `assert @ens:owner!(${NAME}) == 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const v1 = expectV2OrV1(
          param,
          `${selectorOf("getOwner(uint256)")}${ID}`,
        );
        const cond = d.core(v1 as never);
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
      name: "reads the expiry on ENSv2, or off the base registrar by labelhash",
      script: `assert @ens:expiry!(${NAME}) > 1700000000`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const v1 = expectV2OrV1(
          param,
          `${selectorOf("getExpiry(uint256)")}${ID}`,
        );
        const call = d.staticCallOf(v1 as never);
        expect(call.target).to.equal(BASE_REGISTRAR);
        expect(call.data).to.equal(
          `${selectorOf("nameExpires(uint256)")}${word(BigInt(labelhash("vitalik"))).slice(2)}`,
        );
        d.expectConstraint(param, "Gte", 1700000001n);
      },
    },
    {
      name: "asks the ETHRegistrar whether a label is available",
      script: `assert @ens:available!(${NAME}) == false`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(ETH_REGISTRAR);
        expect(call.data.startsWith(selectorOf("isAvailable(string)"))).to.be
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
