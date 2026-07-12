import type { Address } from "viem";

// All addresses below were verified to have bytecode on their chain via
// eth_getCode (2026-07). Adapters still lazily re-check with client.getCode
// before use so a stale entry degrades to a clear error.

/** Canonical wrapped-native token per chain (WETH, WXDAI, WPOL...). */
export const WRAPPED_NATIVE: Record<number, Address> = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  10: "0x4200000000000000000000000000000000000006", // WETH (OP Stack predeploy)
  100: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", // WXDAI
  137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WPOL (ex-WMATIC)
  8453: "0x4200000000000000000000000000000000000006", // WETH (OP Stack predeploy)
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
};

/** UniswapV2-style router + factory pair. */
export interface V2Deployment {
  router: Address;
  factory: Address;
}

// https://docs.uniswap.org/contracts/v2/reference/smart-contracts/v2-deployments
export const UNISWAP_V2: Record<number, V2Deployment> = {
  1: {
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  },
  10: {
    router: "0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2",
    factory: "0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf",
  },
  137: {
    router: "0xedf6066a2b290C185783862C7F4776A2C8077AD1",
    factory: "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C",
  },
  8453: {
    router: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
    factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
  },
  42161: {
    router: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
    factory: "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9",
  },
};

// Sushi's classic V2 AMM. Optimism/Base run RouteProcessor-only (routes are
// built by Sushi's API), so they are deliberately absent.
export const SUSHISWAP_V2: Record<number, V2Deployment> = {
  1: {
    router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
  },
  100: {
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
  },
  137: {
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
  },
  42161: {
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
  },
};

// 1hive's UniswapV2 fork (router WETH() sanity-checked: WXDAI on Gnosis,
// WPOL on Polygon).
export const HONEYSWAP: Record<number, V2Deployment> = {
  100: {
    router: "0x1C232F01118CB8B424793ae03F870aa7D0ac7f77",
    factory: "0xA818b4F111Ccac7AA31D0BCc0806d64F2E0737D7",
  },
  137: {
    router: "0xaD340d0CD0B117B0140671E7cB39770e7675C848",
    factory: "0x03DAa61d8007443a6584e3d8f85105096543C19c",
  },
};

/** UniswapV3-style deployment: SwapRouter02 + QuoterV2 + factory. */
export interface V3Deployment {
  router: Address;
  quoter: Address;
  factory: Address;
}

// https://docs.uniswap.org/contracts/v3/reference/deployments
export const UNISWAP_V3: Record<number, V3Deployment> = {
  1: {
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  },
  10: {
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  },
  137: {
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  },
  8453: {
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  },
  42161: {
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  },
};

/** Standard V3 fee tiers scanned when quoting (in hundredths of a bip). */
export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;
