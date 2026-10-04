import "../../setup";
import { CORE_ADDRESS, OPERATIONS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  word,
} from "@evmcrispr/test-utils/evml";
import { encodeAbiParameters, getAddress, keccak256 } from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATIONS = getAddress(OPERATIONS_ADDRESS);
const TOKEN = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const HOLDER = "0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533";
const OWNER = `${TOKEN}::!{owner()(address)}`;
const DIGEST =
  "0x0102030405060708091011121314151617181920212223242526272829303132";

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATIONS,
});

describeCommand("assert (@hash! algorithms)", {
  describeName: "Std > helpers > @hash! on-chain algorithms",
  cases: [
    {
      name: "compiles the sha256 branch through a rawCall to precompile 0x02",
      script: `assert @hash!(${TOKEN}::!{name()(string)} "sha256") == ${DIGEST}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // The digest is the third word of the returned bytes envelope.
        const pick = d.core(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(2n);
        const segs = d.opReadOf(
          pick.args[0] as unknown as DecodedParam,
          "rawCall(address,bytes)",
        );
        expect(segs).to.have.lengthOf(2);
        // heads: [target = 0x02][offset_data = 96], envelope spliced last
        expect(segs[0].paramData).to.equal(
          `0x${word(2n).slice(2)}${word(96n).slice(2)}`,
        );
        expect(d.staticCallOf(segs[1]).target).to.equal(TOKEN);
        d.expectConstraint(param, "Eq", BigInt(DIGEST));
      },
    },
    {
      name: "keeps the keccak256 branch on the Operations hash",
      script: `assert @hash!(${TOKEN}::!{name()(string)} "keccak256") == ${DIGEST}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "hash(bytes)");
        expect(args).to.have.lengthOf(1);
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
      },
    },
    {
      name: "bytes mode hashes the ABI encoder's result",
      script: `assert @hash!(@abi.encode!("address" ${OWNER}) bytes) == ${DIGEST}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "hash(bytes)");
        expect(args).to.have.lengthOf(1);
        // The preimage is the encoder's own read: decoding it as one proves
        // which bytes reach the hash.
        d.opReadOf(args[0], "encodeBytes(string,bytes[])");
        d.expectConstraint(param, "Eq", BigInt(DIGEST));
      },
    },
    {
      name: "bytes mode hashes the packed encoder's result",
      script: `assert @hash!(@abi.encodePacked!("address" ${OWNER}) bytes) == ${DIGEST}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "hash(bytes)");
        expect(args).to.have.lengthOf(1);
        // The packed encoder is a concatenation with one live part, not the
        // ABI encoder: a different preimage reaches the hash. Its value is
        // pinned on a real EVM by the lang preimage parity suite.
        const parts = d.opReadOf(args[0], "concat(bytes[],bytes)");
        expect(parts).to.have.lengthOf(2);
        expect(d.staticCallOf(parts[1]).target).to.equal(ASSERTIONS);
      },
    },
    {
      name: "bytes mode hashes a live address through the packed cut",
      script: `assert @hash!(${OWNER} bytes) == ${DIGEST}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "hash(bytes)");
        expect(args).to.have.lengthOf(1);
        // The same shape @abi.encodePacked! builds for one live word: a
        // concatenation whose single live part is read through the core.
        const parts = d.opReadOf(args[0], "concat(bytes[],bytes)");
        expect(parts).to.have.lengthOf(2);
        expect(d.staticCallOf(parts[1]).target).to.equal(ASSERTIONS);
      },
    },
    {
      name: "bytes mode hashes a bytes return directly",
      script: `assert @hash!(${TOKEN}::!{blob()(bytes)} bytes) == ${DIGEST}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "hash(bytes)");
        expect(args).to.have.lengthOf(1);
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
      },
    },
    {
      name: "bytes-sha256 mode routes the encoder's result through the precompile",
      script: `assert @hash!(@abi.encode!("address" ${OWNER}) bytes-sha256) == ${DIGEST}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const pick = d.core(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(2n);
        const segs = d.opReadOf(
          pick.args[0] as unknown as DecodedParam,
          "rawCall(address,bytes)",
        );
        expect(segs).to.have.lengthOf(2);
        d.opReadOf(segs[1], "encodeBytes(string,bytes[])");
      },
    },
    {
      name: "folds a constant preimage, leaving a plain word comparison",
      script: `assert ${TOKEN}::!{root()(bytes32)} == @hash!(@abi.encode!("address" ${HOLDER}) bytes)`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        expect(d.staticCallOf(param).target).to.equal(TOKEN);
        d.expectConstraint(
          param,
          "Eq",
          BigInt(
            keccak256(encodeAbiParameters([{ type: "address" }], [HOLDER])),
          ),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "rejects an unknown on-chain algorithm",
      script: `assert @hash!(${TOKEN}::!{name()(string)} "blake2b") == ${DIGEST}`,
      error:
        'unknown hash algorithm "blake2b"; @hash! expects one of: keccak256, bytes, sha256, bytes-sha256',
    },
    {
      name: "refuses a bytes return without a bytes mode",
      script: `assert @hash!(${TOKEN}::!{blob()(bytes)}) == ${DIGEST}`,
      error: "this one is bytes: write @hash!(… bytes)",
    },
    {
      name: "refuses helper-built bytes without a bytes mode",
      script: `assert @hash!(@abi.encode!("address" ${OWNER})) == ${DIGEST}`,
      error: "this one is bytes: write @hash!(… bytes)",
    },
    {
      name: "refuses a string return in a bytes mode",
      script: `assert @hash!(${TOKEN}::!{name()(string)} bytes) == ${DIGEST}`,
      error: "this one is a string: write @hash!(… keccak256)",
    },
    {
      name: "refuses a number, which has two byte forms",
      script: `assert @hash!(${TOKEN}::!{totalSupply()(uint256)} bytes) == ${DIGEST}`,
      error:
        '@hash!(@abi.encode!("uint256" …) bytes) for the 32-byte ABI word, or @hash!(@abi.encodePacked!("uint256" …) bytes) for the packed bytes.',
    },
    {
      name: "refuses an address in a text mode and names the bytes mode",
      script: `assert @hash!(${OWNER}) == ${DIGEST}`,
      error:
        "this one is an address: write @hash!(… bytes) to hash its 20 bytes",
    },
  ],
});
