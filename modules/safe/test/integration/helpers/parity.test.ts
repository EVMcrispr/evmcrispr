import "../../setup";
import {
  describeParity,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters } from "viem";
import { helpers } from "../../../src/_generated";

/**
 * @safe's single-read helpers, against constant-returning mocks.
 *
 * No Safe on either fork answers `getThreshold()`, so the alternative to a
 * mock is no coverage at all. What this proves is narrower than the other
 * suites and worth stating plainly: each helper issues the SAME call on both
 * faces and decodes the returned bytes the same way. It proves nothing about
 * Safe's own behaviour, because the mock has none.
 *
 * Sound only because these three call one function and both faces call the
 * same one. `@isOwner` is excluded on purpose: the plain face scans
 * `getOwners()` while the `!` face calls `isOwner()`, and a mock answering
 * every selector with one blob would feed each face bytes meant for the
 * other. `@guard` reads a storage slot off-chain, so it is out for the same
 * reason.
 */

const T = "0x0000000000000000000000000000000000005a01";
const N = "0x0000000000000000000000000000000000005a02";
const O = "0x0000000000000000000000000000000000005a03";

const OWNERS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
];

describeParity("@safe", {
  module: "safe",
  helpers,
  setup: async (client) => {
    await installConstantMock(
      client,
      T,
      encodeAbiParameters([{ type: "uint256" }], [3n]),
    );
    await installConstantMock(
      client,
      N,
      encodeAbiParameters([{ type: "uint256" }], [42n]),
    );
    await installConstantMock(
      client,
      O,
      encodeAbiParameters([{ type: "address[]" }], [OWNERS as never]),
    );
  },
  cases: [
    {
      name: "threshold reads getThreshold on both faces",
      run: `@safe:threshold(${T})`,
      compile: `@safe:threshold!(${T})`,
    },
    {
      name: "nonce reads nonce on both faces",
      run: `@safe:nonce(${N})`,
      compile: `@safe:nonce!(${N})`,
    },
    {
      // The `!` face re-frames the getOwners envelope as a words payload, so
      // this also pins that the re-framing lands on the same addresses.
      name: "owners reads getOwners and decodes to the same addresses",
      run: `@safe:owners(${O})`,
      compile: `@safe:owners!(${O})`,
      decodeAs: "address[]",
    },
  ],
});
