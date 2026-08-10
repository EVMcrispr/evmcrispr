import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

/* Sealed blocks are immutable — every asserted field below is frozen
 * on-chain forever, so exact assertions are safe. */

// The gnosis block the fixture WXDAI deposit() was mined in (2020-07-27).
const DEPOSIT_BLOCK = "11173946";
const DEPOSIT_BLOCK_TS = 1595862470n;

// Mainnet block 46147 (2015-08-07): carries the first mainnet transaction.
// Frontier-era, so it predates EIP-1559 and EIP-4844.
const FRONTIER_BLOCK = "46147";
const FRONTIER_HASH =
  "0x4e3a3754410177e6937ef1f84bba68ea139e8d1a2258c5f85db9f1cd715a1bdd";
const FRONTIER_COINBASE = "0xe6A7a1d47ff21B6321162AEA7C6CB457D5476Bca";

// Mainnet block 19426587 (2024-03-13): the first Dencun block — its
// excessBlobGas is 0, so its EIP-4844 blob base fee is exactly 1 wei.
const DENCUN_BLOCK = "19426587";

// Mainnet block 19529728 (2024-03-28, blobscriptions congestion):
// excessBlobGas 0x4a00000 → fake_exponential(1, 77594624, 3338477).
const BLOB_SPIKE_BLOCK = "19529728";
const BLOB_SPIKE_FEE = 12419351077n;

describeHelper(
  "@receipts:block.timestamp",
  {
    module: "receipts",
    cases: [
      {
        name: "should read the timestamp of a sealed block",
        input: `@receipts:block.timestamp(${DEPOSIT_BLOCK})`,
        expected: DEPOSIT_BLOCK_TS,
      },
      {
        name: "should read a sealed block on another chain via the chain arg",
        input: `@receipts:block.timestamp(${FRONTIER_BLOCK} mainnet)`,
        expected: 1438918233n,
      },
      {
        name: "should default to the latest block",
        input: "@receipts:block.timestamp",
        validate: (result) => {
          expect(Number(String(result))).to.be.greaterThan(1_700_000_000);
        },
      },
    ],
    errorCases: [
      {
        name: "should reject a block address that is neither number nor tag",
        input: "@receipts:block.timestamp(bogus)",
        error: "<block> must be a block number or one of",
      },
      {
        name: "should hint at the chain argument for unknown blocks",
        input: "@receipts:block.timestamp(99999999999 mainnet)",
        error: "pass the chain as a second argument",
      },
    ],
    docCases: [
      {
        description: "Read the timestamp a sealed block was mined at",
        code: `set $when @receipts:block.timestamp(19426587 mainnet)`,
      },
    ],
    sampleArgs: [DEPOSIT_BLOCK, "gnosis"],
  },
  helpers["block.timestamp"].argDefs,
);

describeHelper(
  "@receipts:block.number",
  {
    module: "receipts",
    cases: [
      {
        name: "should read the number of a sealed block",
        input: `@receipts:block.number(${DEPOSIT_BLOCK})`,
        expected: 11173946n,
      },
      {
        name: "should resolve a block tag to its current number",
        input: "@receipts:block.number(finalized mainnet)",
        validate: (result) => {
          // Finalized mainnet is far past the Dencun block by now.
          expect(Number(String(result))).to.be.greaterThan(19_426_587);
        },
      },
      {
        name: "should default to the latest block",
        input: "@receipts:block.number",
        validate: (result) => {
          expect(Number(String(result))).to.be.greaterThan(40_000_000);
        },
      },
    ],
    docCases: [
      {
        description: "Pin the current finalized block number",
        code: `set $finalized @receipts:block.number(finalized)`,
      },
    ],
    sampleArgs: [DEPOSIT_BLOCK, "gnosis"],
  },
  helpers["block.number"].argDefs,
);

describeHelper(
  "@receipts:block.baseFee",
  {
    module: "receipts",
    cases: [
      {
        name: "should read the base fee of a sealed block",
        input: `@receipts:block.baseFee(${DENCUN_BLOCK} mainnet)`,
        expected: 61952457264n,
      },
    ],
    errorCases: [
      {
        name: "should error for blocks predating EIP-1559",
        input: `@receipts:block.baseFee(${FRONTIER_BLOCK} mainnet)`,
        error: "predates EIP-1559",
      },
    ],
    docCases: [
      {
        description: "Read the base fee of a sealed block",
        code: `set $fee @receipts:block.baseFee(19426587 mainnet)`,
      },
    ],
    sampleArgs: [DEPOSIT_BLOCK, "gnosis"],
  },
  helpers["block.baseFee"].argDefs,
);

describeHelper(
  "@receipts:block.gasLimit",
  {
    module: "receipts",
    cases: [
      {
        name: "should read the gas limit of a sealed block",
        input: `@receipts:block.gasLimit(${FRONTIER_BLOCK} mainnet)`,
        expected: 21003n,
      },
    ],
    docCases: [
      {
        description: "Read the gas limit of a sealed block",
        code: `set $limit @receipts:block.gasLimit(46147 mainnet)`,
      },
    ],
    sampleArgs: [DEPOSIT_BLOCK, "gnosis"],
  },
  helpers["block.gasLimit"].argDefs,
);

describeHelper(
  "@receipts:block.coinbase",
  {
    module: "receipts",
    cases: [
      {
        name: "should read the fee recipient of a sealed block",
        input: `@receipts:block.coinbase(${FRONTIER_BLOCK} mainnet)`,
        expected: FRONTIER_COINBASE,
      },
    ],
    docCases: [
      {
        description: "Read the fee recipient of a sealed block",
        code: `set $proposer @receipts:block.coinbase(46147 mainnet)`,
      },
    ],
    sampleArgs: [DEPOSIT_BLOCK, "gnosis"],
  },
  helpers["block.coinbase"].argDefs,
);

describeHelper(
  "@receipts:block.prevrandao",
  {
    module: "receipts",
    cases: [
      {
        name: "should read the RANDAO mix of a sealed post-merge block",
        input: `@receipts:block.prevrandao(${DENCUN_BLOCK} mainnet)`,
        expected:
          17229749272312862576950911051252111128407560936438466514599426803756376817506n,
      },
    ],
    docCases: [
      {
        description: "Read the RANDAO mix of a sealed block",
        code: `set $rand @receipts:block.prevrandao(19426587 mainnet)`,
      },
    ],
    sampleArgs: [DEPOSIT_BLOCK, "gnosis"],
  },
  helpers["block.prevrandao"].argDefs,
);

describeHelper(
  "@receipts:block.hash",
  {
    module: "receipts",
    cases: [
      {
        // The off-chain face reads ANY sealed block — unlike
        // @block.hash!, which BLOCKHASH limits to the previous 256.
        name: "should read the hash of a sealed block far older than 256 blocks",
        input: `@receipts:block.hash(${FRONTIER_BLOCK} mainnet)`,
        expected: FRONTIER_HASH,
      },
    ],
    docCases: [
      {
        description: "Read the hash of any sealed block",
        code: `set $hash @receipts:block.hash(46147 mainnet)`,
      },
    ],
    sampleArgs: [DEPOSIT_BLOCK, "gnosis"],
  },
  helpers["block.hash"].argDefs,
);

describeHelper(
  "@receipts:block.blobBaseFee",
  {
    module: "receipts",
    cases: [
      {
        name: "should compute the blob base fee of a zero-excess sealed block",
        input: `@receipts:block.blobBaseFee(${DENCUN_BLOCK} mainnet)`,
        expected: 1n,
      },
      {
        name: "should compute the blob base fee of a congested sealed block via fake_exponential",
        input: `@receipts:block.blobBaseFee(${BLOB_SPIKE_BLOCK} mainnet)`,
        expected: BLOB_SPIKE_FEE,
      },
      {
        name: "should read the live blob base fee over RPC with no arguments",
        input: "@receipts:block.blobBaseFee",
        validate: (result) => {
          expect(Number(String(result))).to.be.at.least(1);
        },
      },
    ],
    errorCases: [
      {
        name: "should error for blocks predating EIP-4844",
        input: `@receipts:block.blobBaseFee(${FRONTIER_BLOCK} mainnet)`,
        error: "predates EIP-4844",
      },
    ],
    docCases: [
      {
        description: "Read the blob base fee a sealed block charged",
        code: `set $blobfee @receipts:block.blobBaseFee(19529728 mainnet)`,
      },
    ],
    sampleArgs: [DEPOSIT_BLOCK, "gnosis"],
  },
  helpers["block.blobBaseFee"].argDefs,
);
