import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { encodeAbiParameters, keccak256, sha256, toHex } from "viem";
import { helpers } from "../../../src/_generated";

const HOLDER = "0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533";

const WORD =
  "0xff000000000000000000000000000000000000000000000000000000000000a1";

describeHelper(
  "@hash",
  {
    cases: [
      {
        name: "return the keccak256 hash by default",
        input: "@hash('an example test')",
        expected: keccak256(toHex("an example test")),
      },
      {
        name: "return the keccak256 hash when selected explicitly",
        input: "@hash('an example test' keccak256)",
        expected: keccak256(toHex("an example test")),
      },
      {
        name: "return the sha256 hash when selected",
        input: "@hash('an example test' sha256)",
        expected: sha256(toHex("an example test")),
      },
      {
        // Text mode hashes the characters of a hex value, as it always has.
        name: "hash a hex value as text by default",
        input: "@hash(0x1234)",
        expected: keccak256(toHex("0x1234")),
      },
      {
        name: "hash a hex value as its bytes in bytes mode",
        input: "@hash(0x1234 bytes)",
        expected: keccak256("0x1234"),
      },
      {
        name: "hash a hex value as its bytes with sha256 in bytes-sha256 mode",
        input: "@hash(0x1234 bytes-sha256)",
        expected: sha256("0x1234"),
      },
      {
        name: "hash the ABI encoding of an address in bytes mode",
        input: `@hash(@abi.encode("address" ${HOLDER}) bytes)`,
        expected: keccak256(
          encodeAbiParameters([{ type: "address" }], [HOLDER]),
        ),
      },
      {
        name: "hash the packed bytes of an address in bytes mode",
        input: `@hash(@abi.encodePacked("address" ${HOLDER}) bytes)`,
        expected: keccak256(HOLDER),
      },
      {
        // An address is its 20 bytes, whatever the casing of its hex.
        name: "hash an address as its 20 bytes in bytes mode",
        input: `@hash(${HOLDER} bytes)`,
        expected: keccak256(HOLDER),
      },
      {
        name: "hash a 32-byte value as its 32 bytes in bytes mode",
        input: `@hash(${WORD} bytes)`,
        expected: keccak256(WORD),
      },
      {
        name: "hash a 32-byte value with sha256 in bytes-sha256 mode",
        input: `@hash(${WORD} bytes-sha256)`,
        expected: sha256(WORD),
      },
    ],
    errorCases: [
      {
        name: "refuse a number in bytes mode",
        input: "@hash(255 bytes)",
        error: "hashes a hex bytes value, got 255",
      },
      {
        input: "@hash('an example test' md5)",
        error:
          'unknown hash algorithm "md5"; expected one of: keccak256, bytes, sha256, bytes-sha256',
      },
      {
        name: "refuse text in bytes mode",
        input: "@hash('an example test' bytes)",
        error:
          "@hash in `bytes` mode hashes a hex bytes value, got an example test; use `keccak256` to hash it as text",
      },
      {
        name: "refuse text in bytes-sha256 mode",
        input: "@hash('an example test' bytes-sha256)",
        error: "use `sha256` to hash it as text",
      },
      {
        name: "refuse an odd-length hex value in bytes mode",
        input: "@hash(0x123 bytes)",
        error: "hashes a hex bytes value, got 0x123",
      },
    ],
    docCases: [
      {
        description: "Compute a function selector",
        code: `set $sel @hash("transfer(address,uint256)")`,
      },
      {
        description: "Hash the ABI encoding of an address as bytes",
        code: 'set $leaf @hash(@abi.encode("address" 0xd0Dd6cEF72143E22cCED4867eb0d5F2328715533) bytes)',
      },
      {
        description: "Hash with sha256 instead of keccak256",
        code: `set $digest @hash("an example" sha256)`,
      },
    ],
    sampleArgs: ["exampleValue", "keccak256"],
  },
  helpers.hash.argDefs,
);
