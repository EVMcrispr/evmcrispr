import "../../setup";
import {
  describeParity,
  installSelectorMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import { helpers } from "../../../src/_generated";

const WXDAI = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d";
const EOA = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

/** Selector mock feeding the live-key/index slot cases. */
const MOCK = "0x00000000000000000000000000000000005107ab";
const KEY_CALL = `${MOCK}::{key()(address)}`;
const NAME_CALL = `${MOCK}::{name()(string)}`;
const LEN_CALL = `${MOCK}::{len()(uint256)}`;

describeParity("@contracts", {
  module: "contracts",
  helpers,
  setup: (client) =>
    installSelectorMock(client, MOCK, [
      {
        selector: toFunctionSelector("function key() view returns (address)"),
        data: encodeAbiParameters([{ type: "address" }], [EOA]),
      },
      {
        selector: toFunctionSelector("function name() view returns (string)"),
        data: encodeAbiParameters([{ type: "string" }], ["giv"]),
      },
      {
        selector: toFunctionSelector("function len() view returns (uint256)"),
        data: encodeAbiParameters([{ type: "uint256" }], [7n]),
      },
    ]),
  cases: [
    {
      // Constant inputs fold to the run face's exact value at composition.
      name: "slot.mapping of a constant key folds to the plain answer",
      run: `@contracts:slot.mapping(3 ${EOA})`,
      compile: `@contracts:slot.mapping!(3 ${EOA})`,
    },
    {
      // The live word is ABI left-padded exactly like encodeKey pads a
      // value-type key.
      name: "slot.mapping of a live address key",
      run: `@contracts:slot.mapping(3 ${EOA})`,
      compile: `@contracts:slot.mapping!(3 ${KEY_CALL})`,
    },
    {
      // A live string key hashes its raw payload, like encodeKey does for
      // string keys.
      name: "slot.mapping of a live string key",
      run: '@contracts:slot.mapping(7 "giv")',
      compile: `@contracts:slot.mapping!(7 ${NAME_CALL})`,
    },
    {
      name: "slot.mapping refuses a live base slot",
      run: `@contracts:slot.mapping(3 ${EOA})`,
      compile: `@contracts:slot.mapping!(${LEN_CALL} ${EOA})`,
      helper: "slot.mapping",
      refuses: /base slot must be a constant/,
    },
    {
      name: "slot.array of a constant index folds to the plain answer",
      run: "@contracts:slot.array(5 7)",
      compile: "@contracts:slot.array!(5 7)",
    },
    {
      name: "slot.array of a live index",
      run: "@contracts:slot.array(5 7)",
      compile: `@contracts:slot.array!(5 ${LEN_CALL})`,
    },
    {
      // A build-time snapshot against a live EXTCODECOPY. They agree on a
      // fork that does not move; the reason to prefer the `!` face is that it
      // also sees code a batch deployed in an earlier step.
      name: "codeAt reads the runtime code of a contract",
      run: `@contracts:codeAt(${WXDAI})`,
      compile: `@contracts:codeAt!(${WXDAI})`,
    },
    {
      name: "codeAt of an account with no code is empty",
      run: `@contracts:codeAt(${EOA})`,
      compile: `@contracts:codeAt!(${EOA})`,
    },
    {
      name: "codeHash of a contract",
      run: `@contracts:codeHash(${WXDAI})`,
      compile: `@contracts:codeHash!(${WXDAI})`,
    },
    {
      // EXTCODEHASH of an account with no code is keccak of the empty string,
      // not zero — worth pinning because the two are easy to confuse.
      name: "codeHash of an account with no code",
      run: `@contracts:codeHash(${EOA})`,
      compile: `@contracts:codeHash!(${EOA})`,
    },
  ],
});
