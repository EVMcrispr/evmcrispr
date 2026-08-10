import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * The string and bytes families, over a LIVE string.
 *
 * A constant would fold at composition time and never reach the chain, so the
 * text comes from a call. The point of the on-chain faces is that they work on
 * the decoded payload rather than the ABI envelope, and several of them count
 * or slice BYTES where the plain face counts UTF-16 code units — so a
 * non-ASCII case is included deliberately, as that is where they part company.
 */

const TEXT = "0x0000000000000000000000000000000000007e11";
const S = `${TEXT}::{text()(string)}`;
/** ASCII only, so byte length and code-unit length agree. */
const VALUE = "alpha beta gamma";

const BYTES_SRC = "0x0000000000000000000000000000000000007e12";
const B = `${BYTES_SRC}::{blob()(bytes)}`;
const BLOB = "0x00112233445566778899aabbccddeeff";

describeParity("@lang strings", {
  module:
    "lang [@str.len @str.at @str.slice @str.upper @str.lower @str.concat @str.includes @str.split @str.join @str.replace @str.charset @bytes.len @bytes.at @bytes.slice @bytes.concat]",
  helpers,
  setup: async (client) => {
    await installConstantMock(
      client,
      TEXT,
      encodeAbiParameters([{ type: "string" }], [VALUE]),
    );
    await installConstantMock(
      client,
      BYTES_SRC,
      encodeAbiParameters([{ type: "bytes" }], [BLOB as `0x${string}`]),
    );
  },
  cases: [
    {
      name: "str.len counts a live string",
      run: `@str.len(${S})`,
      compile: `@str.len!(${S})`,
    },
    {
      name: "str.at selects a byte",
      run: `@str.at(${S} 0)`,
      compile: `@str.at!(${S} 0)`,
    },
    {
      name: "str.at with a negative index",
      run: `@str.at(${S} -1)`,
      compile: `@str.at!(${S} -1)`,
    },
    {
      name: "str.slice extracts a range",
      run: `@str.slice(${S} 0 5)`,
      compile: `@str.slice!(${S} 0 5)`,
    },
    {
      name: "str.slice to the end",
      run: `@str.slice(${S} 6)`,
      compile: `@str.slice!(${S} 6)`,
    },
    {
      name: "str.upper maps ASCII",
      run: `@str.upper(${S})`,
      compile: `@str.upper!(${S})`,
    },
    {
      name: "str.lower maps ASCII",
      run: `@str.lower(${S})`,
      compile: `@str.lower!(${S})`,
    },
    {
      name: "str.concat joins a live string to a constant",
      run: `@str.concat(${S} "!")`,
      compile: `@str.concat!(${S} "!")`,
    },
    {
      name: "str.includes finds a substring",
      run: `@str.includes(${S} "beta")`,
      compile: `@str.includes!(${S} "beta")`,
    },
    {
      name: "str.includes is false for an absent substring",
      run: `@str.includes(${S} "zzz")`,
      compile: `@str.includes!(${S} "zzz")`,
    },
    {
      name: "str.split takes a segment",
      run: `@str.split(${S} " " 1)`,
      compile: `@str.split!(${S} " " 1)`,
    },
    {
      name: "str.split takes the last segment",
      run: `@str.split(${S} " " -1)`,
      compile: `@str.split!(${S} " " -1)`,
    },
    {
      name: "str.replace swaps a substring",
      run: `@str.replace(${S} "beta" "delta")`,
      compile: `@str.replace!(${S} "beta" "delta")`,
    },
    {
      name: "str.charset checks the alphabet",
      run: `@str.charset(${S} "abcdefghijklmnopqrstuvwxyz ")`,
      compile: `@str.charset!(${S} "abcdefghijklmnopqrstuvwxyz ")`,
    },
    {
      name: "bytes.len counts a live bytes value",
      run: `@bytes.len(${B})`,
      compile: `@bytes.len!(${B})`,
    },
    {
      name: "bytes.at selects one byte",
      run: `@bytes.at(${B} 1)`,
      compile: `@bytes.at!(${B} 1)`,
    },
    {
      name: "bytes.slice extracts a range",
      run: `@bytes.slice(${B} 0 4)`,
      compile: `@bytes.slice!(${B} 0 4)`,
    },
  ],
});
