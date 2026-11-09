import type { ChainDef } from "@evmcrispr/sdk";

// Literal-only declarations: hosts and docs read this file without loading
// the module. ChiadoX, the EEZ team's testnet (https://chiadox.eez.dev),
// is Gnosis Chiado settling an EEZ rollup. Both chains go through an EEZ
// composer front, their `gateway`: an ordinary JSON-RPC that also takes
// cross-chain transactions, composes them with the other chain's
// execution, and prices them (`eez_quoteFee`). A cross-chain transaction
// pays for its settlement through its priority fee and is refused below
// it, so the executor asks the gateway before sending, in scripts that
// load this module, and uses no quote that commits a transaction to more
// than `gatewayMaxFee`. The composer cannot estimate the gas of a
// cross-chain call itself (`eth_estimateGas`), so `eez:on`/`eez:batch`
// size their own gas. A devnet; it may be reset.
export const chains: ChainDef[] = [
  // Viem's Gnosis Chiado (same key, name and RPC; the explorer viem
  // lists is gone, this is the one the sdk links), declared only
  // to add its gateway: transactions that start on Chiado compose only
  // when they reach it.
  {
    id: 10200,
    key: "gnosisChiado",
    name: "Gnosis Chiado",
    rpcUrl: "https://rpc.chiadochain.net",
    nativeCurrency: { name: "Gnosis", symbol: "xDAI", decimals: 18 },
    explorerUrl: "https://gnosis-chiado.blockscout.com",
    testnet: true,
    gateway: "https://chiadox.eez.dev/composer/l1",
    // 0.01 xDAI, about twenty times the settlement fee.
    gatewayMaxFee: "10000000000000000",
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
  },
];
