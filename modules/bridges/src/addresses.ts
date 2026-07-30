import type { Address } from "viem";

/**
 * Address books for the bridge adapters. Chain coverage: mainnet (1),
 * Optimism (10), Gnosis (100), Polygon PoS (137), Base (8453),
 * Arbitrum One (42161).
 *
 * Sources (verified 2026-07): Circle CCTP docs, Across deployments repo,
 * LayerZero metadata, Chainlink CCIP directory, OP Stack & Arbitrum docs.
 */

/** Chains any adapter may serve — used for receipt probing and completions. */
export const SUPPORTED_CHAINS = [1, 10, 100, 137, 8453, 42161] as const;

/** Native (CCTP-burnable) USDC per chain. Gnosis only has bridged USDC.e,
 *  which is NOT burnable through CCTP. */
export const USDC: Record<number, Address> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
};

// ── CCTP v2 (Circle) — same address on every supported EVM chain ─────────

export const CCTP_TOKEN_MESSENGER_V2: Address =
  "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
export const CCTP_MESSAGE_TRANSMITTER_V2: Address =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

/** chainId → CCTP domain. */
export const CCTP_DOMAINS: Record<number, number> = {
  1: 0,
  10: 2,
  42161: 3,
  8453: 6,
  137: 7,
};

/** CCTP domain → chainId (inverse of CCTP_DOMAINS). */
export const CCTP_DOMAIN_TO_CHAIN: Record<number, number> = Object.fromEntries(
  Object.entries(CCTP_DOMAINS).map(([chain, domain]) => [
    domain,
    Number(chain),
  ]),
);

/** Finality threshold requesting a fully-finalized (standard) transfer. */
export const CCTP_FINALITY_FINALIZED = 2000;

export const IRIS_API = "https://iris-api.circle.com";

// ── Across ────────────────────────────────────────────────────────────────

export const ACROSS_SPOKE_POOL: Record<number, Address> = {
  1: "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5",
  10: "0x6f26Bf09B1C792e3228e5467807a900A503c0281",
  137: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096",
  8453: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
  42161: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A",
};

export const ACROSS_API = "https://app.across.to/api";

// ── LayerZero v2 ──────────────────────────────────────────────────────────

/** EndpointV2 — same address on all chains covered here. */
export const LZ_ENDPOINT_V2: Address =
  "0x1a44076050125825900e736c501f859c50fE728c";

/** chainId → LayerZero v2 endpoint id. */
export const LZ_EIDS: Record<number, number> = {
  1: 30101,
  10: 30111,
  100: 30145,
  137: 30109,
  8453: 30184,
  42161: 30110,
};

/** LayerZero eid → chainId (inverse of LZ_EIDS). */
export const LZ_EID_TO_CHAIN: Record<number, number> = Object.fromEntries(
  Object.entries(LZ_EIDS).map(([chain, eid]) => [eid, Number(chain)]),
);

/** (chainId → canonical token → OFT/OFT-adapter). Sparse: tokens whose OFT
 *  wrapper differs from the token itself. The LayerZero adapter also accepts
 *  the <token> argument being an OFT directly. */
export const OFT_BOOK: Record<number, Record<Address, Address>> = {};

export const LZ_SCAN_API = "https://scan.layerzero-api.com/v1";

// ── Chainlink CCIP ────────────────────────────────────────────────────────

export const CCIP_ROUTER: Record<number, Address> = {
  1: "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D",
  10: "0x3206695CaE29952f4b0c22a169725a865bc8Ce0f",
  100: "0x4aAD6071085df840abD9Baf1697d5D5992bDadce",
  137: "0x849c5ED5a80F5B408Dd4969b78c2C8fdf0565Bfe",
  8453: "0x881e3A65B4d4a04dD529061dd0071cf975F58bCD",
  42161: "0x141fa059441E0ca23ce184B6A78bafD2A517DdE8",
};

/** chainId → CCIP chain selector. */
export const CCIP_SELECTORS: Record<number, bigint> = {
  1: 5009297550715157269n,
  10: 3734403246176062136n,
  100: 465200170687744372n,
  137: 4051577828743386545n,
  8453: 15971525489660198786n,
  42161: 4949039107694359620n,
};

/** CCIP selector → chainId (inverse of CCIP_SELECTORS). */
export const CCIP_SELECTOR_TO_CHAIN: Record<string, number> =
  Object.fromEntries(
    Object.entries(CCIP_SELECTORS).map(([chain, selector]) => [
      selector.toString(),
      Number(chain),
    ]),
  );

// ── Native bridges ────────────────────────────────────────────────────────

/** OP Stack L1 contracts per L2 chain id (mainnet as the L1). */
export const OP_ROUTES: Record<number, { l1Bridge: Address; portal: Address }> =
  {
    10: {
      l1Bridge: "0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1",
      portal: "0xbEb5Fc579115071764c7423A4f12eDde41f106Ed",
    },
    8453: {
      l1Bridge: "0x3154Cf16ccdb4C6d922629664174b904d80F2C35",
      portal: "0x49048044D57e1C92A77f79988d21Fa8fAF74E97e",
    },
  };

/** Predeploys, identical on every OP Stack L2. */
export const OP_L2_STANDARD_BRIDGE: Address =
  "0x4200000000000000000000000000000000000010";
export const OP_L2_MESSAGE_PASSER: Address =
  "0x4200000000000000000000000000000000000016";

/** (l2ChainId → L1 token → L2 token) pairs for OP Stack bridgeERC20To.
 *  --remote-token overrides; seeded with the majors. */
export const OP_TOKEN_PAIRS: Record<number, Record<Address, Address>> = {
  10: {
    // DAI
    "0x6B175474E89094C44Da98b954EedeAC495271d0F":
      "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  },
  8453: {
    // DAI
    "0x6B175474E89094C44Da98b954EedeAC495271d0F":
      "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  },
};

/** Arbitrum One contracts. */
export const ARB_INBOX: Address = "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f";
export const ARB_OUTBOX: Address = "0x0B9857ae2D4A3DBe74ffE1d7DF045bb7F96E4840";
export const ARB_L1_GATEWAY_ROUTER: Address =
  "0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef";
export const ARB_L2_GATEWAY_ROUTER: Address =
  "0x5288c571Fd7aD117beA99bF60FE0846C4E84F933";
export const ARB_L1_ERC20_GATEWAY: Address =
  "0xa3A7B6F88361F48403514059F1F16C8E78d60EeC";
export const ARB_L2_ERC20_GATEWAY: Address =
  "0x09e9222E96E7B4AE2a407B98d48e330053351EEe";
/** ArbSys precompile on Arbitrum (L2→L1 messaging). */
export const ARB_SYS: Address = "0x0000000000000000000000000000000000000064";
/** NodeInterface virtual contract (proof construction RPCs). */
export const ARB_NODE_INTERFACE: Address =
  "0x00000000000000000000000000000000000000C8";

/** EIP-?: Arbitrum address aliasing for L1→L2 sender addresses. */
export function arbAliasL1Address(l1Address: Address): Address {
  const OFFSET = 0x1111000000000000000000000000000000001111n;
  const MOD = 1n << 160n;
  const aliased = (BigInt(l1Address) + OFFSET) % MOD;
  return `0x${aliased.toString(16).padStart(40, "0")}` as Address;
}
