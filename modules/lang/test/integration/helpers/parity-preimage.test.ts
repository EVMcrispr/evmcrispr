import "../../setup";
import { describe, it } from "bun:test";
import type { Operand } from "@evmcrispr/sdk/onchain";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  describeParity,
  installAssertionsCore,
  installConstantMock,
  resolveValue,
  show,
} from "@evmcrispr/test-utils/onchain";
import type { Address } from "viem";
import { encodeAbiParameters, keccak256 } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * Bytes built on-chain by one face and consumed by another.
 *
 * A single word (an address, a number, a bytes32) has no byte form of its own:
 * `abi.encode` gives 32 bytes and `abi.encodePacked` gives the type's width,
 * and their digests and lengths differ. So no bytes consumer takes a word.
 * The script names the encoder, and the encoder's result feeds the consumer.
 * These cases pin that the composition runs on a real EVM and agrees with the
 * off-chain face, whose digests come from viem rather than from the contracts.
 */

const HOLDER = "0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533";
const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";

const ADDR_SRC = "0x00000000000000000000000000000000000add01";
const ARR_SRC = "0x00000000000000000000000000000000000add02";
const BLOB_SRC = "0x00000000000000000000000000000000000add03";
const WORD_SRC = "0x00000000000000000000000000000000000add04";

const ID_SRC = "0x00000000000000000000000000000000000add05";
const SEL_SRC = "0x00000000000000000000000000000000000add06";
const PAIR_SRC = "0x00000000000000000000000000000000000add07";
const ADDRS_SRC = "0x00000000000000000000000000000000000add08";
const FLAG_SRC = "0x00000000000000000000000000000000000add09";
/** High and low bytes set, so a cut from the wrong end changes the digest. */
const ID_VALUE =
  "0xff000000000000000000000000000000000000000000000000000000000000a1";
const OTHER = "0x00000000000000000000000000000000000000A2";

const OWNER = `${ADDR_SRC}::{owner()(address)}`;
const ARR = `${ARR_SRC}::{values()(uint256[])}`;
const BLOB = `${BLOB_SRC}::{blob()(bytes)}`;
const SMALL = `${WORD_SRC}::{value()(uint256)}`;
const ID = `${ID_SRC}::{id()(bytes32)}`;
const SELECTOR = `${SEL_SRC}::{selector()(bytes4)}`;
const PAIR = `${PAIR_SRC}::{pair()(uint256,address)}`;
const ADDRS = `${ADDRS_SRC}::{owners()(address[])}`;
const FLAG = `${FLAG_SRC}::{flag()(bool)}`;
const SYMBOL = `${WXDAI}::{symbol()(string)}`;

describeParity("@lang preimages", {
  module: "lang [@bytes.len @bytes.at @bytes.slice @bytes.concat @at]",
  preamble: "load contracts",
  helpers,
  setup: async (client) => {
    await installConstantMock(
      client,
      ADDR_SRC,
      encodeAbiParameters([{ type: "address" }], [HOLDER]),
    );
    await installConstantMock(
      client,
      ARR_SRC,
      encodeAbiParameters([{ type: "uint256[]" }], [[11n, 22n, 33n]]),
    );
    await installConstantMock(
      client,
      BLOB_SRC,
      encodeAbiParameters([{ type: "bytes" }], ["0xdeadbeef"]),
    );
    await installConstantMock(
      client,
      WORD_SRC,
      encodeAbiParameters([{ type: "uint256" }], [0x1234n]),
    );
    await installConstantMock(
      client,
      ID_SRC,
      encodeAbiParameters([{ type: "bytes32" }], [ID_VALUE]),
    );
    await installConstantMock(
      client,
      SEL_SRC,
      encodeAbiParameters([{ type: "bytes4" }], ["0xa9059cbb"]),
    );
    await installConstantMock(
      client,
      PAIR_SRC,
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "address" }],
        [7n, HOLDER],
      ),
    );
    await installConstantMock(
      client,
      ADDRS_SRC,
      encodeAbiParameters([{ type: "address[]" }], [[OTHER, HOLDER]]),
    );
    await installConstantMock(
      client,
      FLAG_SRC,
      encodeAbiParameters([{ type: "bool" }], [true]),
    );
  },
  cases: [
    // ---- @hash!: the digest of an explicit preimage ------------------
    {
      name: "hash digests the ABI encoding of a live address",
      run: `@hash(@abi.encode("address" ${OWNER}) bytes)`,
      compile: `@hash!(@abi.encode!("address" ${OWNER}) bytes)`,
    },
    {
      name: "hash digests the packed bytes of a live address",
      run: `@hash(@abi.encodePacked("address" ${OWNER}) bytes)`,
      compile: `@hash!(@abi.encodePacked!("address" ${OWNER}) bytes)`,
    },
    {
      name: "hash digests several packed values",
      run: `@hash(@abi.encodePacked("address,uint256,uint16" ${OWNER} ${SMALL} 7) bytes)`,
      compile: `@hash!(@abi.encodePacked!("address,uint256,uint16" ${OWNER} ${SMALL} 7) bytes)`,
    },
    {
      name: "hash digests the ABI encoding of a live array",
      run: `@hash(@abi.encode("uint256[]" ${ARR}) bytes)`,
      compile: `@hash!(@abi.encode!("uint256[]" ${ARR}) bytes)`,
    },
    {
      name: "hash digests the ABI encoding of a live string beside a word",
      run: `@hash(@abi.encode("string,address" ${SYMBOL} ${OWNER}) bytes)`,
      compile: `@hash!(@abi.encode!("string,address" ${SYMBOL} ${OWNER}) bytes)`,
    },
    {
      name: "hash digests the bytes a call returns",
      run: `@hash(${BLOB} bytes)`,
      compile: `@hash!(${BLOB} bytes)`,
    },
    {
      name: "hash digests a concatenation",
      run: `@hash(@bytes.concat(${BLOB} 0x1234) bytes)`,
      compile: `@hash!(@bytes.concat!(${BLOB} 0x1234) bytes)`,
    },
    {
      name: "hash digests deployed code",
      run: `@hash(@contracts:codeAt(${WXDAI}) bytes)`,
      compile: `@hash!(@contracts:codeAt!(${WXDAI}) bytes)`,
    },
    {
      name: "hash computes sha256 over an encoding",
      run: `@hash(@abi.encode("address" ${OWNER}) bytes-sha256)`,
      compile: `@hash!(@abi.encode!("address" ${OWNER}) bytes-sha256)`,
    },
    {
      name: "hash folds a constant",
      run: "@hash(0x1234 bytes)",
      compile: "@hash!(0x1234 bytes)",
    },
    {
      name: "hash folds an encoder over constants",
      run: `@hash(@abi.encode("address" ${HOLDER}) bytes)`,
      compile: `@hash!(@abi.encode!("address" ${HOLDER}) bytes)`,
    },
    // ---- a word with a width of its own: address and bytesN ---------------
    {
      // Off-chain an address is its 20 bytes, so on-chain the short form
      // hashes those same 20 bytes.
      name: "hash in bytes mode digests the 20 bytes of a live address",
      run: `@hash(${OWNER} bytes)`,
      compile: `@hash!(${OWNER} bytes)`,
    },
    {
      name: "hash in bytes-sha256 mode digests the 20 bytes of a live address",
      run: `@hash(${OWNER} bytes-sha256)`,
      compile: `@hash!(${OWNER} bytes-sha256)`,
    },
    {
      name: "hash in bytes mode digests the 32 bytes of a live bytes32",
      run: `@hash(${ID} bytes)`,
      compile: `@hash!(${ID} bytes)`,
    },
    {
      name: "hash in bytes-sha256 mode digests the 32 bytes of a live bytes32",
      run: `@hash(${ID} bytes-sha256)`,
      compile: `@hash!(${ID} bytes-sha256)`,
    },
    {
      name: "hash in bytes mode digests the 4 bytes of a live bytes4",
      run: `@hash(${SELECTOR} bytes)`,
      compile: `@hash!(${SELECTOR} bytes)`,
    },
    {
      name: "hash in bytes mode digests an address selected by a lens",
      run: `@hash(${OWNER} bytes)`,
      compile: `@hash!(${PAIR}[_ $] bytes)`,
    },
    {
      name: "hash in bytes mode digests an address element of a live array",
      run: `@hash(@at(${ADDRS} 1) bytes)`,
      compile: `@hash!(@at!(${ADDRS} 1) bytes)`,
    },
    {
      name: "hash of a hash digests the 32 digest bytes",
      run: `@hash(@hash(${SYMBOL}) bytes)`,
      compile: `@hash!(@hash!(${SYMBOL}) bytes)`,
    },
    {
      name: "the short form of an address is its packed encoding",
      run: `@hash(${OWNER} bytes)`,
      compile: `@hash!(@abi.encodePacked!("address" ${OWNER}) bytes)`,
    },
    {
      // Read as text an address would be its hex spelling, which the chain
      // does not have. The off-chain face does hash that spelling.
      name: "hash refuses an address in the default text mode and names bytes",
      helper: "hash",
      run: `@hash(${OWNER})`,
      compile: `@hash!(${OWNER})`,
      refuses:
        /reads its argument as text in `keccak256` mode, and this one is an address: write @hash!\(… bytes\) to hash its 20 bytes$/,
    },
    {
      name: "hash refuses a bytes32 in sha256 mode and names bytes-sha256",
      helper: "hash",
      run: `@hash(${ID} sha256)`,
      compile: `@hash!(${ID} sha256)`,
      refuses:
        /this one is a bytes32 \(32 bytes\): write @hash!\(… bytes-sha256\) to hash its 32 bytes$/,
    },
    {
      // A number has no width of its own: 0x1234 is two bytes off-chain and
      // a uint256 is 32 on-chain. The encoder stays mandatory.
      name: "hash refuses a uint256 in bytes mode and names both preimages",
      helper: "hash",
      run: `@hash(${SMALL} bytes)`,
      compile: `@hash!(${SMALL} bytes)`,
      refuses:
        /got uint256\. It has two byte forms.*@hash!\(@abi\.encode!\("uint256" …\) bytes\).*@hash!\(@abi\.encodePacked!\("uint256" …\) bytes\)/,
    },
    {
      name: "hash refuses a bool in bytes mode and names both preimages",
      helper: "hash",
      run: `@hash(${FLAG} bytes)`,
      compile: `@hash!(${FLAG} bytes)`,
      refuses:
        /got bool\. It has two byte forms.*@hash!\(@abi\.encode!\("bool" …\) bytes\)/,
    },
    {
      name: "hash refuses a number produced by a nested helper in bytes mode",
      helper: "hash",
      run: `@hash(@at(${ARR} 0) bytes)`,
      compile: `@hash!(@at!(${ARR} 0) bytes)`,
      refuses: "its nested helper resolves a single word",
    },
    {
      name: "hash refuses an array and names its encoding",
      helper: "hash",
      run: `@hash(${ARR} bytes)`,
      compile: `@hash!(${ARR} bytes)`,
      refuses:
        /got uint256\[\]\. Its bytes are its ABI encoding: write @hash!\(@abi\.encode!\("uint256\[\]" …\) bytes\)\.$/,
    },
    {
      name: "hash refuses a string in bytes mode",
      helper: "hash",
      run: `@hash(${SYMBOL} bytes)`,
      compile: `@hash!(${SYMBOL} bytes)`,
      refuses: "this one is a string: write @hash!(… keccak256)",
    },
    {
      name: "hash refuses an unknown algorithm",
      helper: "hash",
      run: `@hash(${BLOB} md5)`,
      compile: `@hash!(${BLOB} md5)`,
      refuses: 'unknown hash algorithm "md5"',
    },

    // ---- the other bytes consumers over a helper-built operand -------------
    {
      name: "bytes.len measures an ABI encoding",
      run: `@bytes.len(@abi.encode("address" ${OWNER}))`,
      compile: `@bytes.len!(@abi.encode!("address" ${OWNER}))`,
    },
    {
      name: "bytes.len measures a packed encoding",
      run: `@bytes.len(@abi.encodePacked("address" ${OWNER}))`,
      compile: `@bytes.len!(@abi.encodePacked!("address" ${OWNER}))`,
    },
    {
      name: "bytes.at reads a byte of an ABI encoding",
      run: `@bytes.at(@abi.encode("address" ${OWNER}) 31)`,
      compile: `@bytes.at!(@abi.encode!("address" ${OWNER}) 31)`,
    },
    {
      name: "bytes.slice cuts an ABI encoding",
      run: `@bytes.slice(@abi.encode("uint256,address" ${SMALL} ${OWNER}) 30 40)`,
      compile: `@bytes.slice!(@abi.encode!("uint256,address" ${SMALL} ${OWNER}) 30 40)`,
    },
    {
      name: "bytes.concat joins a packed word to a constant",
      run: `@bytes.concat(@abi.encodePacked("address" ${OWNER}) 0x1234)`,
      compile: `@bytes.concat!(@abi.encodePacked!("address" ${OWNER}) 0x1234)`,
    },
    {
      // A live array has no packed face, and does not need one: its packed
      // bytes are its ABI encoding without the offset and length words.
      name: "the packed bytes of a live array are a slice of its encoding",
      run: `@abi.encodePacked("uint256[]" ${ARR})`,
      compile: `@bytes.slice!(@abi.encode!("uint256[]" ${ARR}) 64)`,
    },
    {
      name: "bytes.len refuses a word and names both preimages",
      helper: "bytes.len",
      run: `@bytes.len(${OWNER})`,
      compile: `@bytes.len!(${OWNER})`,
      refuses:
        /got address\. It has two byte forms, so name one: @abi\.encode!\("address" …\) for the 32-byte ABI word, or @abi\.encodePacked!\("address" …\) for the packed bytes\.$/,
    },
  ],
});

/**
 * One address, two preimages. In bytes mode the address itself is its 20
 * bytes, the same as its packed encoding; the 32-byte ABI word is a different
 * digest and has to be asked for. Each is checked against viem's own keccak
 * over bytes built here, not against the other face.
 */
describe("@lang preimages > one word, two digests", () => {
  it("resolves an address to its 20 bytes, and its ABI word apart", async () => {
    const client = getPublicClient();
    const { core, operators } = await installAssertionsCore(client);
    await installConstantMock(
      client,
      ADDR_SRC,
      encodeAbiParameters([{ type: "address" }], [HOLDER]),
    );
    const env = { module: "lang", core, operators };
    const digestOf = async (expression: string) => {
      const { operand } = await compileExpression(expression, env);
      return show(
        await resolveValue(client, operand as Operand, {
          core: core as Address,
        }),
      );
    };

    const short = await digestOf(`@hash!(${OWNER} bytes)`);
    const packed = await digestOf(
      `@hash!(@abi.encodePacked!("address" ${OWNER}) bytes)`,
    );
    const encoded = await digestOf(
      `@hash!(@abi.encode!("address" ${OWNER}) bytes)`,
    );

    // The short form is the address's own 20 bytes: viem's keccak over them,
    // and the same digest the packed encoder gives.
    expect(short).to.include(keccak256(HOLDER));
    expect(packed).to.equal(short);
    // The ABI word is a different preimage, reachable only by naming it.
    expect(encoded).to.include(
      keccak256(encodeAbiParameters([{ type: "address" }], [HOLDER])),
    );
    expect(encoded).to.not.equal(short);
  }, 30_000);
});
