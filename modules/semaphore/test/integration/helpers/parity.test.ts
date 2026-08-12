import "../../setup";
import {
  describeParity,
  installSelectorMock,
} from "@evmcrispr/test-utils/onchain";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import { helpers } from "../../../src/_generated";
import { buildProofJson } from "../../../src/utils/proof";

/**
 * @semaphore against the real v4 singleton on the Gnosis fork (deployed at
 * block 42,592,255, far below any fork block), plus a selector mock for
 * nonzero values — no group on the public fork is ours to control, so the
 * zero-reads against the real contract pin the calldata encoding and the
 * mock pins the value plumbing. The mock is selected through the module's
 * own `$semaphore:address` override, which both faces resolve through.
 */

/** 2^100 — a group id far past groupCounter, never created. */
const NO_GROUP = (1n << 100n).toString();

/** Structurally valid proof JSON (what semaphore:prove binds), fixture
 *  values only — the mock ignores arguments and the real singleton
 *  rejects the group before ever reading the points. */
const PROOF = buildProofJson({
  merkleTreeDepth: 2n,
  merkleTreeRoot: 3n,
  nullifier: 4n,
  message: 5n,
  scope: 6n,
  points: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
});

const LOAD = "semaphore [@depth @root @size @verify]";

describeParity("@semaphore (real singleton)", {
  module: LOAD,
  helpers,
  cases: [
    {
      name: "depth of a never-created group reads 0 on both faces",
      run: `@depth(${NO_GROUP})`,
      compile: `@depth!(${NO_GROUP})`,
    },
    {
      name: "root of a never-created group reads 0 on both faces",
      run: `@root(${NO_GROUP})`,
      compile: `@root!(${NO_GROUP})`,
    },
    {
      name: "size of a never-created group reads 0 on both faces",
      run: `@size(${NO_GROUP})`,
      compile: `@size!(${NO_GROUP})`,
    },
    {
      name: "verify against a nonexistent group reverts at judgement",
      run: `@verify('${PROOF}' ${NO_GROUP})`,
      compile: `@verify!('${PROOF}' ${NO_GROUP})`,
      reverts: /GroupDoesNotExist|revert/i,
    },
  ],
});

const MOCK = "0x00000000000000000000000000000000005e4a01";
const uintReturn = (v: bigint) =>
  encodeAbiParameters([{ type: "uint256" }], [v]);

describeParity("@semaphore (mocked singleton)", {
  module: LOAD,
  helpers,
  preamble: `set $semaphore:address ${MOCK}\nset $semaphore:deployBlock 1`,
  setup: (client) =>
    installSelectorMock(client, MOCK, [
      {
        selector: toFunctionSelector(
          "function getMerkleTreeDepth(uint256) view returns (uint256)",
        ),
        data: uintReturn(2n),
      },
      {
        selector: toFunctionSelector(
          "function getMerkleTreeRoot(uint256) view returns (uint256)",
        ),
        data: uintReturn(0x1234n),
      },
      {
        selector: toFunctionSelector(
          "function getMerkleTreeSize(uint256) view returns (uint256)",
        ),
        data: uintReturn(3n),
      },
      {
        selector: toFunctionSelector(
          "function verifyProof(uint256,(uint256,uint256,uint256,uint256,uint256,uint256[8])) view returns (bool)",
        ),
        data: encodeAbiParameters([{ type: "bool" }], [true]),
      },
    ]),
  cases: [
    {
      name: "nonzero depth agrees across faces",
      run: "@depth(1)",
      compile: "@depth!(1)",
    },
    {
      name: "nonzero root agrees across faces",
      run: "@root(1)",
      compile: "@root!(1)",
    },
    {
      name: "nonzero size agrees across faces",
      run: "@size(1)",
      compile: "@size!(1)",
    },
    {
      name: "a verifying proof reads true on both faces",
      run: `@verify('${PROOF}' 1)`,
      compile: `@verify!('${PROOF}' 1)`,
    },
    {
      // The group id itself may be live: the compile face splices the
      // mock-read word into the getter calldata (the mock ignores
      // arguments, so the values still agree).
      name: "a live group id splices into the read",
      run: "@depth(2)",
      compile: `@depth!(${MOCK}::{getMerkleTreeDepth(uint256)(uint256) 7})`,
    },
  ],
});
