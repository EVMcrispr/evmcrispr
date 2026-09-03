import type { Address } from "viem";

// Canonical Safe v1.4.1 deployments (same address on all supported chains).
// See https://github.com/safe-global/safe-deployments
export const SAFE_PROXY_FACTORY: Address =
  "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
export const SAFE_L2_SINGLETON: Address =
  "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
export const SAFE_SINGLETON: Address =
  "0x41675C099F32341bf84BFc5382aF534df5C7461a";
export const COMPATIBILITY_FALLBACK_HANDLER: Address =
  "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";
export const MULTISEND: Address = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";
export const MULTISEND_CALL_ONLY: Address =
  "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";

export const SENTINEL: Address = "0x0000000000000000000000000000000000000001";

/** The Safe v1.4.1 contracts the module relies on, on one chain. */
export interface SafeDeployment {
  proxyFactory: Address;
  l2Singleton: Address;
  fallbackHandler: Address;
  multiSend: Address;
  multiSendCallOnly: Address;
}

/** Safe's own deployment, through the Safe Singleton Factory. */
export const CANONICAL_DEPLOYMENT: SafeDeployment = {
  proxyFactory: SAFE_PROXY_FACTORY,
  l2Singleton: SAFE_L2_SINGLETON,
  fallbackHandler: COMPATIBILITY_FALLBACK_HANDLER,
  multiSend: MULTISEND,
  multiSendCallOnly: MULTISEND_CALL_ONLY,
};

/** The same v1.4.1 creation bytecode, deployed with a zero salt through the
 *  Arachnid CREATE2 deployer (`scripts/deploy-create2.ts`) on chains the
 *  Safe Singleton Factory never reached. Identical on every such chain. */
export const CREATE2_DEPLOYMENT: SafeDeployment = {
  proxyFactory: "0xd9d2Ba03a7754250FDD71333F444636471CACBC4",
  l2Singleton: "0x76667330c237Fb40f28d74563cdAAae4b06C23Ec",
  fallbackHandler: "0xcB4a8d3609A7CCa2D9c063a742f75c899BF2f7b5",
  multiSend: "0x7B21BBDBdE8D01Df591fdc2dc0bE9956Dde1e16C",
  multiSendCallOnly: "0x32228dDEA8b9A2bd7f2d71A958fF241D79ca5eEC",
};

/** Chains without the canonical deployment. */
const DEPLOYMENTS: Record<number, SafeDeployment> = {
  7331: CREATE2_DEPLOYMENT, // EEZ devnet L1
  6290: CREATE2_DEPLOYMENT, // EEZ devnet L2
};

/** The Safe contracts to use on `chainId`: canonical unless listed above. */
export const safeDeployment = (chainId: number): SafeDeployment =>
  DEPLOYMENTS[chainId] ?? CANONICAL_DEPLOYMENT;

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
