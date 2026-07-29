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

/** Canonical Permit2, same address on every chain. */
export const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/** UniswapV4 deployment: PoolManager + UniversalRouter + V4Quoter. */
export interface V4Deployment {
  poolManager: Address;
  universalRouter: Address;
  quoter: Address;
}

// https://docs.uniswap.org/contracts/v4/deployments
export const UNISWAP_V4: Record<number, V4Deployment> = {
  1: {
    poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
    universalRouter: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
    quoter: "0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203",
  },
  10: {
    poolManager: "0x9a13f98cb987694c9f086b1f5eb990eea8264ec3",
    universalRouter: "0x851116d9223fabed8e56c0e6b8ad0c31d98b3507",
    quoter: "0x1f3131a13296fb91c90870043742c3cdbff1a8d7",
  },
  137: {
    poolManager: "0x67366782805870060151383f4bbff9dab53e5cd6",
    universalRouter: "0x1095692a6237d83c6a72f3f5efedb9a670c49223",
    quoter: "0xb3d5c3dfc3a7aebff71895a7191796bffc2c81b9",
  },
  8453: {
    poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
    universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
    quoter: "0x0d5e0f971ed27fbff6c2837bf31316121532048d",
  },
  42161: {
    poolManager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
    universalRouter: "0xa51afafe0263b40edaef0df8781ea9aa03e381a3",
    quoter: "0x3972c00f7ed4885e145823eb7c655375d275a1c5",
  },
};

/** Hookless V4 pools use the canonical tick spacing of each fee tier. */
export const V4_FEE_TIERS: ReadonlyArray<
  readonly [fee: number, tickSpacing: number]
> = [
  [100, 1],
  [500, 10],
  [3000, 60],
  [10000, 200],
];

/** Balancer V2 Vault, same address on every supported chain. */
export const BALANCER_VAULT: Address =
  "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

/** Balancer API chain enum values (https://api-v3.balancer.fi). */
export const BALANCER_CHAINS: Record<number, string> = {
  1: "MAINNET",
  10: "OPTIMISM",
  100: "GNOSIS",
  137: "POLYGON",
  8453: "BASE",
  42161: "ARBITRUM",
};
