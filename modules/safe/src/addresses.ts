import type { Address } from "viem";

// Canonical Safe v1.5.0 deployments (same address on all supported chains).
// See https://github.com/safe-global/safe-deployments
export const SAFE_PROXY_FACTORY: Address =
  "0x14F2982D601c9458F93bd70B218933A6f8165e7b";
export const SAFE_L2_SINGLETON: Address =
  "0xEdd160fEBBD92E350D4D398fb636302fccd67C7e";
export const SAFE_SINGLETON: Address =
  "0xFf51A5898e281Db6DfC7855790607438dF2ca44b";
export const COMPATIBILITY_FALLBACK_HANDLER: Address =
  "0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4";
export const MULTISEND: Address = "0x218543288004CD07832472D464648173c77D7eB7";
export const MULTISEND_CALL_ONLY: Address =
  "0xA83c336B20401Af773B6219BA5027174338D1836";
/** SafeMigration: delegatecalled by a Safe >=1.3.0 to move it to v1.5.0. */
export const SAFE_MIGRATION: Address =
  "0x6439e7ABD8Bb915A5263094784C5CF561c4172AC";
/** SafeToL2Setup: delegatecalled from setup() to switch a new Safe to the L2
 *  singleton on every chain but Ethereum mainnet, so it can be created with
 *  the plain singleton, at the same address, everywhere. */
export const SAFE_TO_L2_SETUP: Address =
  "0x900C7589200010D6C6eCaaE5B06EBe653bc2D82a";

export const SENTINEL: Address = "0x0000000000000000000000000000000000000001";

/** The Safe v1.5.0 contracts the module relies on, on one chain. */
export interface SafeDeployment {
  proxyFactory: Address;
  singleton: Address;
  l2Singleton: Address;
  fallbackHandler: Address;
  multiSend: Address;
  multiSendCallOnly: Address;
  migration: Address;
  toL2Setup: Address;
}

/** Safe's own deployment, through the Safe Singleton Factory. */
export const CANONICAL_DEPLOYMENT: SafeDeployment = {
  proxyFactory: SAFE_PROXY_FACTORY,
  singleton: SAFE_SINGLETON,
  l2Singleton: SAFE_L2_SINGLETON,
  fallbackHandler: COMPATIBILITY_FALLBACK_HANDLER,
  multiSend: MULTISEND,
  multiSendCallOnly: MULTISEND_CALL_ONLY,
  migration: SAFE_MIGRATION,
  toL2Setup: SAFE_TO_L2_SETUP,
};

/** The same v1.5.0 creation bytecode, deployed with a zero salt through the
 *  Arachnid CREATE2 deployer (`scripts/deploy-create2.ts`) on chains the
 *  Safe Singleton Factory never reached. Identical on every such chain;
 *  `bun scripts/deploy-create2.ts --print` recomputes it. */
export const CREATE2_DEPLOYMENT: SafeDeployment = {
  proxyFactory: "0x34aeE8688B23516f9cD8F145D52D5a13080028D2",
  singleton: "0x59CAB03C911eF5Ab4590Bb6c4F00B768C10F09D8",
  l2Singleton: "0x13C1aa76867b98E21c443e5d461f07925C3c2163",
  fallbackHandler: "0x4Ce17b2E86bD577e5c0eC112C3fB96A621C7C0fc",
  multiSend: "0x4faF5C1F98B09F1494bDaf93c85E2A05FbC1e1Bd",
  multiSendCallOnly: "0x756E377D1dcDC33bD973216E64D32bec6aB4b569",
  migration: "0x8feA00BF4b60e9E1912F4D613954d8E3452A8ae9",
  toL2Setup: "0xE750f5d88E935bd6fc6c1fEb906A15C5e7476083",
};

/** Chains without the canonical deployment. */
const DEPLOYMENTS: Record<number, SafeDeployment> = {
  10200: CREATE2_DEPLOYMENT, // Gnosis Chiado (EEZ devnet settlement layer)
  6291: CREATE2_DEPLOYMENT, // EEZ devnet rollup
};

/** The Safe contracts to use on `chainId`: canonical unless listed above. */
export const safeDeployment = (chainId: number): SafeDeployment =>
  DEPLOYMENTS[chainId] ?? CANONICAL_DEPLOYMENT;

/** Official L2 singletons of every supported version, canonical and
 *  eip155/CREATE2 variants: a Safe on one of them upgrades to the v1.5.0 L2
 *  singleton, any other to the plain one (as Safe{Wallet} decides). */
export const KNOWN_L2_SINGLETONS: Address[] = [
  "0x3E5c63644E683549055b9Be8653de26E0B4CD36E", // 1.3.0
  "0xfb1bffC9d739B8D520DaF37dF666da4C687191EA", // 1.3.0 eip155
  "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", // 1.4.1
  "0x76667330c237Fb40f28d74563cdAAae4b06C23Ec", // 1.4.1 CREATE2 (EEZ)
  SAFE_L2_SINGLETON,
  CREATE2_DEPLOYMENT.l2Singleton,
];
/** Official CompatibilityFallbackHandlers: an upgrade replaces one of them
 *  (or none) with the v1.5.0 handler, and keeps any custom handler. */
export const KNOWN_FALLBACK_HANDLERS: Address[] = [
  "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4", // 1.3.0
  "0x017062a1dE2FE6b99BE3d9d37841FeD19F573804", // 1.3.0 eip155
  "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99", // 1.4.1
  "0xcB4a8d3609A7CCa2D9c063a742f75c899BF2f7b5", // 1.4.1 CREATE2 (EEZ)
  COMPATIBILITY_FALLBACK_HANDLER,
  CREATE2_DEPLOYMENT.fallbackHandler,
];

// Zodiac (gnosisguild) canonical deployments.
// See https://github.com/gnosisguild/zodiac/blob/master/src/contracts.ts
export const MODULE_PROXY_FACTORY: Address =
  "0x000000000000aDdB49795b0f9bA5BC298cDda236";
// Non-faulty mastercopy versions, newest first. Not every version is
// deployed on every chain, so installers pick the first candidate with
// code on the current chain (v1.1.0 Delay and v2.1.0 Roles are flagged
// FAULTY upstream and deliberately excluded).
export const DELAY_MASTERCOPIES: Address[] = [
  "0x824175b945838d127c1ca83cbce11d8e44f6df01", // Delay v1.1.1
  "0xd54895B1121A2eE3f37b502F507631FA1331BED6", // Delay v1.0.1
];
export const ROLES_MASTERCOPIES: Address[] = [
  "0xf2964ce6161ce0e75964fe7927ce114cb0b283d5", // Roles v2.1.1
];
export const SCOPE_GUARD_MASTERCOPIES: Address[] = [
  "0xeF27fcd3965a866b22Fb2d7C689De9AB7e611f1F", // ScopeGuard v1.0.0
];

// Guard address storage slot: keccak256("guard_manager.guard.address")
export const GUARD_STORAGE_SLOT =
  "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8" as const;

// Module guard address storage slot (Safe >=1.5.0):
// keccak256("module_manager.module_guard.address")
export const MODULE_GUARD_STORAGE_SLOT =
  "0xb104e0b93118902c651344349b610029d694cfdec91c589c91ebafbcd0289947" as const;

// ERC-165 ids setGuard/setModuleGuard require (GS300/GS301 otherwise).
export const TRANSACTION_GUARD_INTERFACE_ID = "0xe6d7a83a" as const;
export const MODULE_GUARD_INTERFACE_ID = "0x58401ed8" as const;

// EIP-3770 chain short names used by the Safe Transaction Service
// (https://api.safe.global/tx-service/{shortName}) and the Safe web UI.
export const CHAIN_SHORT_NAMES = new Map<number, string>([
  [1, "eth"],
  [10, "oeth"],
  [56, "bnb"],
  [100, "gno"],
  [130, "unichain"],
  [137, "matic"],
  [146, "sonic"],
  [324, "zksync"],
  [1101, "zkevm"],
  [5000, "mantle"],
  [8453, "base"],
  [42161, "arb1"],
  [42220, "celo"],
  [43114, "avax"],
  [59144, "linea"],
  [534352, "scr"],
  [11155111, "sep"],
  [84532, "basesep"],
]);
