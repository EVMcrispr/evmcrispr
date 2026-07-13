import type { Address } from "viem";

// Gnosis fixtures, verified against the Superfluid extended tokenlist and
// @superfluid-finance/metadata v1.6.3 (2026-07-13); all live at the pinned
// fork block.

/** xDAIx — the native-asset SuperToken on Gnosis (payable upgradeByETH). */
export const XDAIX: Address = "0x59988e47A3503AaFaA0368b9deF095c818Fdca01";
/** USDCx on Gnosis — wrapper SuperToken over 6-decimal USDC. */
export const USDCX: Address = "0x1234756ccf0660E866305289267211823Ae86eEc";
/** USDC on Gnosis — USDCx's 6-decimal underlying. */
export const USDC: Address = "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83";
/** CFAv1Forwarder (same address on every mainnet). */
export const CFA_FORWARDER: Address =
  "0xcfA132E353cB4E398080B9700609bb008eceB125";
/** GDAv1Forwarder (same address on every network). */
export const GDA_FORWARDER: Address =
  "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08";
/** FlowScheduler on Gnosis. */
export const FLOW_SCHEDULER: Address =
  "0x9cC7fc484fF588926149577e9330fA5b2cA74336";
/** VestingScheduler V3 on Gnosis. */
export const VESTING_SCHEDULER_V3: Address =
  "0x625F04c9B91ECdfbeb7021271749212388F12c11";
/** Auto-Wrap Manager / WrapStrategy on Gnosis. */
export const AUTOWRAP_MANAGER: Address =
  "0x8082e58681350876aFe8f52d3Bf8672034A03Db0";
export const AUTOWRAP_STRATEGY: Address =
  "0x51FBAbD31A615E14b1bC12E9d887f60997264a4E";

export const ZERO_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";
/** An address with no contract code — never a SuperToken. */
export const SOME_ADDRESS: Address =
  "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";
/** A second plain receiver address. */
export const RECEIVER: Address = "0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71";

/** 1000e18/mo floored to wei/second (10^21 / 2592000). */
export const RATE_1000_PER_MONTH = 385802469135802n;
