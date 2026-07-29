import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { encodeAbiParameters, keccak256 } from "viem";
import {
  hashDescription,
  hashOperationBatchLocal,
  hashProposalLocal,
} from "../../src/utils";

const TARGET = "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb" as const;
const CALLDATA = "0xa9059cbb" as const;
const ZERO = `0x${"00".repeat(32)}` as const;

describe("Governor > unit > local hash replicas", () => {
  it("hashProposalLocal matches abi.encode + keccak256", () => {
    const descriptionHash = hashDescription("Test");
    const expected = BigInt(
      keccak256(
        encodeAbiParameters(
          [
            { type: "address[]" },
            { type: "uint256[]" },
            { type: "bytes[]" },
            { type: "bytes32" },
          ],
          [[TARGET], [0n], [CALLDATA], descriptionHash],
        ),
      ),
    );
    expect(
      hashProposalLocal([TARGET], [0n], [CALLDATA], descriptionHash),
    ).to.equal(expected);
  });

  it("hashOperationBatchLocal matches abi.encode + keccak256", () => {
    const expected = keccak256(
      encodeAbiParameters(
        [
          { type: "address[]" },
          { type: "uint256[]" },
          { type: "bytes[]" },
          { type: "bytes32" },
          { type: "bytes32" },
        ],
        [[TARGET], [1n], [CALLDATA], ZERO, ZERO],
      ),
    );
    expect(
      hashOperationBatchLocal([TARGET], [1n], [CALLDATA], ZERO, ZERO),
    ).to.equal(expected);
  });
});
