import type { Address } from "@evmcrispr/sdk";
import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import type AragonOSx from ".";

/** Repo subdomains of the governance plugins Aragon maintains. */
export type KnownRepo =
  | "admin"
  | "multisig"
  | "token-voting"
  | "staged-proposal-processor";

export interface OsxDeployment {
  daoFactory: Address;
  daoRegistry: Address;
  pluginSetupProcessor: Address;
  /** PluginSetupProcessor deployment block — floor for on-chain log scans. */
  pluginSetupProcessorBlock: bigint;
  pluginRepoFactory: Address;
  pluginRepoRegistry: Address;
  managementDao: Address;
  /** ENS domain DAO subdomains are registered under (e.g. `mydao.dao.eth`). */
  daoEnsDomain: string;
  /** ENS domain plugin repos are registered under (e.g. `admin.plugin.dao.eth`). */
  pluginEnsDomain: string;
  /** Aragon-hosted OSx subgraph endpoint. */
  subgraphUrl?: string;
  /** Aragon-maintained plugin repo proxies, keyed by repo subdomain. */
  repos: Record<KnownRepo, Address>;
}

const SATSUMA = "https://subgraph.satsuma-prod.com/qHR2wGfc5RLi6/aragon";

/**
 * Aragon OSx deployments, from aragon/osx-commons
 * configs/src/deployments/json (v1.3.0/v1.4.0 merged; framework addresses are
 * the v1.4 ones where redeployed).
 */
export const DEPLOYMENTS: Record<number, OsxDeployment> = {
  // Ethereum mainnet
  1: {
    daoFactory: "0x246503df057A9a85E0144b6867a828c99676128B",
    daoRegistry: "0x7a62da7B56fB3bfCdF70E900787010Bc4c9Ca42e",
    pluginSetupProcessor: "0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f",
    pluginSetupProcessorBlock: 16721862n,
    pluginRepoFactory: "0xcf59C627b7a4052041C4F16B4c635a960e29554A",
    pluginRepoRegistry: "0x5B3B36BdC9470963A2734D6a0d2F6a64C21C159f",
    managementDao: "0xf2d594F3C93C19D7B1a6F15B5489FFcE4B01f7dA",
    daoEnsDomain: "dao.eth",
    pluginEnsDomain: "plugin.dao.eth",
    subgraphUrl: `${SATSUMA}/osx-mainnet/api`,
    repos: {
      admin: "0xA4371a239D08bfBA6E8894eccf8466C6323A52C3",
      multisig: "0x8c278e37D0817210E18A7958524b7D0a1fAA6F7b",
      "token-voting": "0xb7401cD221ceAFC54093168B814Cc3d42579287f",
      "staged-proposal-processor": "0x421FF506E4DC17356965565688D62b55Bf2bf0a5",
    },
  },
  // Optimism
  10: {
    daoFactory: "0xB001Bd6A21056c2a7FB5A5b9005cf896b181e74d",
    daoRegistry: "0xDAb3AB22cdd41ab299d7D674714Ca94e9B63F9dD",
    pluginSetupProcessor: "0x2379Dc18B4A939a2B76F5c79f58aa49193DA56C2",
    pluginSetupProcessorBlock: 135600981n,
    pluginRepoFactory: "0xB4CD80AE1311A16cD660FB53d5d1D78515D9F591",
    pluginRepoRegistry: "0x22A80a41893Cf0211b345de12825800D21C73102",
    managementDao: "0xF24041Eb590F1eA30210f64b40eaE34b9E2f4Fb3",
    daoEnsDomain: "dao.eth",
    pluginEnsDomain: "plugin.dao.eth",
    repos: {
      admin: "0x35B21E1B431299c57678E6bA3274389Fe9c6f02C",
      multisig: "0xe903df20cD497F0CC12E870d784aCAd53CC5c9d6",
      "token-voting": "0x666bFa1c64c40faEE8582496B040AAE35E25c19d",
      "staged-proposal-processor": "0x766aC7e501693e6B0B3FD0806dAf333bD2B01544",
    },
  },
  // Polygon
  137: {
    daoFactory: "0x9BC7f1dc3cFAD56a0EcD924D1f9e70f5C7aF0039",
    daoRegistry: "0x96E54098317631641703404C06A5afAD89da7373",
    pluginSetupProcessor: "0x879D9dfe3F36d7684BeC1a2bB4Aa8E8871A7245B",
    pluginSetupProcessorBlock: 40830341n,
    pluginRepoFactory: "0xdD9a458088B24ed90a4BfacD16e761b01Bb56FB3",
    pluginRepoRegistry: "0xA03C2182af8eC460D498108C92E8638a580b94d4",
    managementDao: "0x6d4FB6Ff01A172774f42789fcfcdd84E68c28494",
    daoEnsDomain: "dao.eth",
    pluginEnsDomain: "plugin.dao.eth",
    subgraphUrl: `${SATSUMA}/osx-polygon/api`,
    repos: {
      admin: "0x7fF570473d0876db16A59e8F04EE7F17Ab117309",
      multisig: "0x5A5035E7E8aeff220540F383a9cf8c35929bcF31",
      "token-voting": "0xae67aea0B830ed4504B36670B5Fa70c5C386Bb58",
      "staged-proposal-processor": "0xc36fE143bd829a80df458Bd9ab52299Df985DC6F",
    },
  },
  // Base
  8453: {
    daoFactory: "0xcc602EA573a42eBeC290f33F49D4A87177ebB8d2",
    daoRegistry: "0xeB98a71d69a1e12B62c10368D9dA5364CE0f7178",
    pluginSetupProcessor: "0x91a851E9Ed7F2c6d41b15F76e4a88f5A37067cC9",
    pluginSetupProcessorBlock: 2094737n,
    pluginRepoFactory: "0xAAAb8c6b83a5C7b1462af4427d97b33197388C38",
    pluginRepoRegistry: "0xB5eB5C011827C9F5787ceE3Abc72d247E36a5a0D",
    managementDao: "0x264308C03feAfA071C97b73b09E911530CCCd216",
    daoEnsDomain: "dao.eth",
    pluginEnsDomain: "plugin.dao.eth",
    repos: {
      admin: "0x212eF339C77B3390599caB4D46222D79fAabcb5c",
      multisig: "0xcDC4b0BC63AEfFf3a7826A19D101406C6322A585",
      "token-voting": "0x2532570DcFb749A7F976136CC05648ef2a0f60b0",
      "staged-proposal-processor": "0x3C13098D4e2FE9aCb2fCEb3EE4fBBe33405eD39D",
    },
  },
  // Arbitrum One
  42161: {
    daoFactory: "0x49e04AB7af7A263b8ac802c1cAe22f5b4E4577Cd",
    daoRegistry: "0xB5146Fd572C669ABC353902e43F47fda4609E38A",
    pluginSetupProcessor: "0x308a1DC5020c4B5d992F5543a7236c465997fecB",
    pluginSetupProcessorBlock: 145462184n,
    pluginRepoFactory: "0x7F5F2BB64efD9c542F26ABa34D59e1895FcDF69D",
    pluginRepoRegistry: "0xCe0B4124dea6105bfB85fB4461c4D39f360E9ef3",
    managementDao: "0xF3AaA3372EbBf01b923a4Cc98Cd847126b3D73cA",
    daoEnsDomain: "dao.eth",
    pluginEnsDomain: "plugin.dao.eth",
    repos: {
      admin: "0x326A2aee6A8eE78D79E7E956DE60C6E452f76a8e",
      multisig: "0x7553E6Fb020c5740768cF289e603770AA09b7aE2",
      "token-voting": "0x1AeD2BEb470aeFD65B43f905Bd5371b1E4749d18",
      "staged-proposal-processor": "0xe3B00403Cd8cBee7af01961c25220289a4Cc5753",
    },
  },
  // Sepolia
  11155111: {
    daoFactory: "0xB815791c233807D39b7430127975244B36C19C8e",
    daoRegistry: "0x308a1DC5020c4B5d992F5543a7236c465997fecB",
    pluginSetupProcessor: "0xC24188a73dc09aA7C721f96Ad8857B469C01dC9f",
    pluginSetupProcessorBlock: 4421516n,
    pluginRepoFactory: "0x399Ce2a71ef78bE6890EB628384dD09D4382a7f0",
    pluginRepoRegistry: "0x35B62715459cB60bf6dC17fF8cfe138EA305E7Ee",
    managementDao: "0xCa834B3F404c97273f34e108029eEd776144d324",
    daoEnsDomain: "aragon-dao.eth",
    pluginEnsDomain: "plugin.aragon-dao.eth",
    subgraphUrl: `${SATSUMA}/osx-sepolia/api`,
    repos: {
      admin: "0x152c9E28995E418870b85cbbc0AEE4e53020edb2",
      multisig: "0x9e7956C8758470dE159481e5DD0d08F8B59217A2",
      "token-voting": "0x424F4cA6FA9c24C03f2396DF0E96057eD11CF7dF",
      "staged-proposal-processor": "0xda62D32C14E8CA78958d6fdC0142A575b0cd6Ad4",
    },
  },
};

const CONFIG_KEYS = [
  "daoFactory",
  "daoRegistry",
  "pluginSetupProcessor",
  "pluginSetupProcessorBlock",
  "pluginRepoFactory",
  "pluginRepoRegistry",
  "managementDao",
  "daoEnsDomain",
  "pluginEnsDomain",
  "subgraphUrl",
] as const;

/**
 * Resolve the OSx deployment for the current chain. Config bindings
 * (`set $aragonosx:<key> <value>`) override individual fields and, when a
 * chain has no known deployment, can define one from scratch — this is how
 * tests run against mock contracts on forks without OSx.
 */
export async function getDeployment(module: AragonOSx): Promise<OsxDeployment> {
  const chainId = await module.getChainId();
  const base = DEPLOYMENTS[chainId];

  const overrides: Partial<Record<(typeof CONFIG_KEYS)[number], any>> = {};
  for (const key of CONFIG_KEYS) {
    const value = module.getConfigBinding(key);
    if (value !== undefined && value !== null) {
      overrides[key] =
        key === "pluginSetupProcessorBlock" ? BigInt(value) : value;
    }
  }

  if (!base && overrides.pluginSetupProcessor === undefined) {
    throw new ErrorException(
      `Aragon OSx is not deployed on ${chainLabel(chainId)}. Set $aragonosx:pluginSetupProcessor and related config bindings to use a custom deployment.`,
    );
  }

  const repoOverrides: Partial<Record<KnownRepo, Address>> = {};
  const repoConfigKeys = {
    admin: "adminRepo",
    multisig: "multisigRepo",
    "token-voting": "tokenVotingRepo",
    "staged-proposal-processor": "stagedProposalProcessorRepo",
  } as const;
  for (const repo of Object.keys(repoConfigKeys) as KnownRepo[]) {
    const value = module.getConfigBinding(repoConfigKeys[repo]);
    if (value) repoOverrides[repo] = value as Address;
  }

  const merged = {
    ...base,
    ...overrides,
    repos: { ...base?.repos, ...repoOverrides },
  } as OsxDeployment;
  merged.daoEnsDomain ??= "dao.eth";
  merged.pluginEnsDomain ??= "plugin.dao.eth";
  return merged;
}
