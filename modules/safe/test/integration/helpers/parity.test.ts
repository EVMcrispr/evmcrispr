import "../../setup";
import {
  describeParity,
  installConstantMock,
  installSelectorMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters, toFunctionSelector } from "viem";
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
 * The first three use a constant mock, sound because both faces call one
 * identical function. `@isOwner` cannot: the plain face SCANS `getOwners()`
 * while the `!` face calls `isOwner()`, so it needs a selector-dispatching
 * mock whose two answers are consistent with each other — and it is covered
 * in both directions, since a scan and a direct call are exactly the pair
 * that could disagree about an absent owner.
 *
 * `@guard` reads a storage slot off-chain and `@modules` paginates, so both
 * stay out.
 */

const T = "0x0000000000000000000000000000000000005a01";
const N = "0x0000000000000000000000000000000000005a02";
const O = "0x0000000000000000000000000000000000005a03";

/** getOwners() lists A; isOwner() agrees. */
const IN = "0x0000000000000000000000000000000000005a04";
/** getOwners() omits A; isOwner() agrees. */
const OUT = "0x0000000000000000000000000000000000005a05";
const A = "0x1111111111111111111111111111111111111111";

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
    const getOwners = toFunctionSelector(
      "function getOwners() view returns (address[])",
    );
    const isOwner = toFunctionSelector(
      "function isOwner(address) view returns (bool)",
    );
    await installSelectorMock(client, IN, [
      {
        selector: getOwners,
        data: encodeAbiParameters([{ type: "address[]" }], [OWNERS as never]),
      },
      {
        selector: isOwner,
        data: encodeAbiParameters([{ type: "bool" }], [true]),
      },
    ]);
    await installSelectorMock(client, OUT, [
      {
        selector: getOwners,
        data: encodeAbiParameters(
          [{ type: "address[]" }],
          [OWNERS.slice(1) as never],
        ),
      },
      {
        selector: isOwner,
        data: encodeAbiParameters([{ type: "bool" }], [false]),
      },
    ]);
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
    {
      // A scan off-chain against a direct call on-chain: the two must agree
      // that the owner IS present.
      name: "isOwner is true whether scanned or asked directly",
      run: `@safe:isOwner(${A} ${IN})`,
      compile: `@safe:isOwner!(${A} ${IN})`,
    },
    {
      // And that it is NOT — the direction where a scan and a call are most
      // likely to part company.
      name: "isOwner is false whether scanned or asked directly",
      run: `@safe:isOwner(${A} ${OUT})`,
      compile: `@safe:isOwner!(${A} ${OUT})`,
    },
  ],
});
