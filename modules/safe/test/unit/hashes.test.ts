import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import {
  concatHex,
  encodeAbiParameters,
  hashMessage,
  hashTypedData,
  keccak256,
  parseAbiParameters,
  zeroAddress,
} from "viem";
import { MULTISEND, MULTISEND_CALL_ONLY } from "../../src/addresses";
import {
  collectSafeTxWarnings,
  getSafeMessageHashes,
  getSafeTxHashes,
} from "../../src/utils/hashes";
import type { SafeTx } from "../../src/utils/safeTx";
import { hashSafeTx } from "../../src/utils/safeTx";

const SAFE = "0x111CEEee040739fD91D29C34C33E6B3E112F2177" as const;

// keccak256 of the SafeTx / EIP712Domain / SafeMessage type strings, as
// hardcoded in the Safe contracts.
const SAFE_TX_TYPEHASH =
  "0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8";
const DOMAIN_TYPEHASH =
  "0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218";
const SAFE_MSG_TYPEHASH =
  "0x60b3cbf8b4a223d68d641b3b6ddf9a298e7f33710cf3d3a9d1146b5a6150fbca";

const baseTx: SafeTx = {
  to: SAFE,
  value: 0n,
  data: "0x",
  operation: 0,
  safeTxGas: 0n,
  baseGas: 0n,
  gasPrice: 0n,
  gasToken: zeroAddress,
  refundReceiver: zeroAddress,
  nonce: 0n,
};

describe("Safe > utils > hashes", () => {
  // Worked example from the pcaversaccio/safe-tx-hashes-util README
  // (arbitrum Safe, nonce 234, addOwnerWithThreshold call).
  const vectorTx: SafeTx = {
    ...baseTx,
    data: "0x0d582f130000000000000000000000000c75fa5a5f1c0997e3eea425cfa13184ed0ec9e50000000000000000000000000000000000000000000000000000000000000003",
    nonce: 234n,
  };

  it("matches the safe-tx-hashes-util reference vector", () => {
    const hashes = getSafeTxHashes(42161, SAFE, vectorTx);
    expect(hashes.domainHash).to.equal(
      "0x1cf7f9b1efe3bc47fe02fd27c649fea19e79d66040683a1c86c7490c80bf7291",
    );
    expect(hashes.messageHash).to.equal(
      "0xd9109ea63c50ecd3b80b6b27ed5c5a9fd3d546c2169dfb69bfa7ba24cd14c7a5",
    );
    expect(hashes.safeTxHash).to.equal(
      "0x0cb7250b8becd7069223c54e2839feaed4cee156363fbfe5dd0a48e75c4e25b3",
    );
  });

  it("agrees with hashSafeTx and recomposes via 0x1901", () => {
    const tx: SafeTx = {
      ...baseTx,
      value: 123n,
      data: "0xdeadbeef",
      operation: 1,
      nonce: 7n,
    };
    const hashes = getSafeTxHashes(100, SAFE, tx);
    expect(hashes.safeTxHash).to.equal(hashSafeTx(100, SAFE, tx));
    expect(
      keccak256(concatHex(["0x1901", hashes.domainHash, hashes.messageHash])),
    ).to.equal(hashes.safeTxHash);
  });

  it("matches the Safe contract's manual struct encoding", () => {
    const hashes = getSafeTxHashes(42161, SAFE, vectorTx);
    const messageHash = keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "bytes32, address, uint256, bytes32, uint8, uint256, uint256, uint256, address, address, uint256",
        ),
        [
          SAFE_TX_TYPEHASH,
          vectorTx.to,
          vectorTx.value,
          keccak256(vectorTx.data),
          vectorTx.operation,
          vectorTx.safeTxGas,
          vectorTx.baseGas,
          vectorTx.gasPrice,
          vectorTx.gasToken,
          vectorTx.refundReceiver,
          vectorTx.nonce,
        ],
      ),
    );
    const domainHash = keccak256(
      encodeAbiParameters(parseAbiParameters("bytes32, uint256, address"), [
        DOMAIN_TYPEHASH,
        42161n,
        SAFE,
      ]),
    );
    expect(hashes.messageHash).to.equal(messageHash);
    expect(hashes.domainHash).to.equal(domainHash);
  });

  it("hashes an EIP-191 string message like the fallback handler", () => {
    const result = getSafeMessageHashes(100, SAFE, "hello world");
    expect(result.kind).to.equal("eip191");
    expect(result.innerHash).to.equal(hashMessage("hello world"));
    const structHash = keccak256(
      encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [
        SAFE_MSG_TYPEHASH,
        keccak256(result.innerHash),
      ]),
    );
    expect(result.messageHash).to.equal(structHash);
    expect(result.safeMessageHash).to.equal(
      keccak256(concatHex(["0x1901", result.domainHash, structHash])),
    );
  });

  it("hashes an EIP-712 typed-data JSON message", () => {
    const typedData = {
      domain: { name: "Test", chainId: 1 },
      types: { Mail: [{ name: "body", type: "string" }] },
      primaryType: "Mail",
      message: { body: "gm" },
    };
    const result = getSafeMessageHashes(100, SAFE, JSON.stringify(typedData));
    expect(result.kind).to.equal("eip712");
    expect(result.innerHash).to.equal(hashTypedData(typedData as any));
  });

  it("rejects malformed or incomplete typed-data JSON", () => {
    expect(() => getSafeMessageHashes(100, SAFE, "{not json")).to.throw(
      "could not be parsed",
    );
    expect(() => getSafeMessageHashes(100, SAFE, '{"types":{}}')).to.throw(
      "`types` and `message`",
    );
  });

  it("collects no warnings for a plain call", () => {
    expect(collectSafeTxWarnings(baseTx)).to.eql([]);
  });

  it("does not warn on delegatecalls to the canonical MultiSends", () => {
    expect(
      collectSafeTxWarnings({ ...baseTx, to: MULTISEND, operation: 1 }),
    ).to.eql([]);
    expect(
      collectSafeTxWarnings({
        ...baseTx,
        to: MULTISEND_CALL_ONLY,
        operation: 1,
      }),
    ).to.eql([]);
  });

  it("warns on untrusted delegatecalls", () => {
    const warnings = collectSafeTxWarnings({ ...baseTx, operation: 1 });
    expect(warnings.length).to.equal(1);
    expect(warnings[0]).to.include("DELEGATECALL");
  });

  it("warns on custom gasToken, refundReceiver and gasPrice", () => {
    const token = "0x3333333333333333333333333333333333333333" as const;
    const receiver = "0x4444444444444444444444444444444444444444" as const;
    expect(collectSafeTxWarnings({ ...baseTx, gasToken: token })[0]).to.include(
      "custom gas token",
    );
    expect(
      collectSafeTxWarnings({ ...baseTx, refundReceiver: receiver })[0],
    ).to.include("custom receiver");
    const combined = collectSafeTxWarnings({
      ...baseTx,
      gasToken: token,
      refundReceiver: receiver,
    });
    expect(combined.length).to.equal(1);
    expect(combined[0]).to.include("hidden value extraction");
    expect(collectSafeTxWarnings({ ...baseTx, gasPrice: 5n })[0]).to.include(
      "non-zero gasPrice",
    );
  });
});
