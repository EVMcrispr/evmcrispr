import type { ModuleChainDef } from "@evmcrispr/sdk";

// Literal-only declarations: hosts and docs read this file without loading
// the module. The EEZ team runs two networks (https://eez.dev), each an EEZ
// rollup settled on a chain viem already knows:
//
// - ChiadoX (https://chiadox.eez.dev), a testnet: Gnosis Chiado ↔ `eezL2`.
// - RollupX (https://rollupx.eez.dev), a devnet on Ethereum mainnet, with
//   real ETH: `mainnet` ↔ `rollupX`.
//
// Every chain goes through an EEZ composer front, its `gateway`: an
// ordinary JSON-RPC that also takes cross-chain transactions, composes them
// with the other chain's execution, and prices them (`eez_quoteFee`). A
// cross-chain transaction pays for its settlement through its priority fee
// and is refused below it, so the executor asks the gateway before sending,
// in scripts that load this module, and uses no quote that commits a
// transaction to more than `gatewayMaxFee`. The settling chains keep viem's
// own definitions: only their gateways are given here. The sending chain's
// own RPC cannot estimate a cross-chain call, so `eez:on`/`eez:batch` size
// their own gas. Devnets; they may be reset.
/** The registry's gate errors: a call through a proxy outside the composed
 *  block it needs reverts with one, so a transaction nobody marked as
 *  crossing chains (a queued Safe transaction, a hand-written call to a
 *  proxy) is still priced by the gateway. `ExecutionNotInCurrentBlock(uint64)`
 *  on L1, `ExecutionNotInCurrentBlock()` on the rollup, `ExecutionNotFound()`. */
export const CROSS_CHAIN_GATES = ["0x9a499f3b", "0xf9d330ad", "0xed6bc750"];

export const chains: ModuleChainDef[] = [
  // ChiadoX. Ceilings: 0.01 xDAI, about twenty times the settlement fee.
  {
    id: 10200,
    gateway: "https://chiadox.eez.dev/composer/l1",
    gatewayMaxFee: "10000000000000000",
    crossChainReverts: CROSS_CHAIN_GATES,
  },
  {
    id: 699169,
    key: "eezL2",
    name: "EEZ L2",
    rpcUrl: "https://chiadox.eez.dev/composer/l2",
    explorerUrl: "https://chiadox.eez.dev/explorer",
    testnet: true,
    gateway: "https://chiadox.eez.dev/composer/l2",
    gatewayMaxFee: "10000000000000000",
    crossChainReverts: CROSS_CHAIN_GATES,
  },
  // RollupX. Ceilings: 0.003 ETH, about twenty times the settlement fee
  // quoted on 2026-11-10 (0.00015 ETH).
  // No gate errors on mainnet: any contract can revert with them, and a
  // mainnet transaction shown to the gateway before it is broadcast is
  // worth something. Only transactions marked as crossing chains reach it.
  {
    id: 1,
    gateway: "https://rollupx.eez.dev/composer/l1",
    gatewayMaxFee: "3000000000000000",
  },
  {
    id: 696991,
    key: "rollupX",
    name: "RollupX",
    rpcUrl: "https://rollupx.eez.dev/composer/l2",
    explorerUrl: "https://rollupx.eez.dev/explorer",
    gateway: "https://rollupx.eez.dev/composer/l2",
    gatewayMaxFee: "3000000000000000",
    crossChainReverts: CROSS_CHAIN_GATES,
  },
];
