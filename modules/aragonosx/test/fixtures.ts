import type { Address } from "viem";

export const SUBGRAPH_URL = "https://osx-subgraph.evmcrispr.test/api";

/** Dummy PSP so `getDeployment` works on the gnosis test fork (no OSx there). */
export const PSP_ADDRESS: Address =
  "0x00000000000000000000000000000000000000a1";

export const DAO_ADDRESS: Address =
  "0x2222222222222222222222222222222222222222";
export const DAO_SUBDOMAIN = "testdao";

export const ADMIN_PLUGIN: Address =
  "0x3333333333333333333333333333333333333331";
export const MULTISIG_PLUGIN: Address =
  "0x3333333333333333333333333333333333333332";
export const TOKEN_VOTING_PLUGIN: Address =
  "0x3333333333333333333333333333333333333333";
export const SPP_PLUGIN: Address =
  "0x3333333333333333333333333333333333333334";
/** Second multisig install, to exercise `multisig:1` numbering. */
export const MULTISIG_PLUGIN_2: Address =
  "0x3333333333333333333333333333333333333335";

export const ADMIN_REPO: Address =
  "0x4444444444444444444444444444444444444441";
export const MULTISIG_REPO: Address =
  "0x4444444444444444444444444444444444444442";
export const TOKEN_VOTING_REPO: Address =
  "0x4444444444444444444444444444444444444443";
export const SPP_REPO: Address =
  "0x4444444444444444444444444444444444444444";

export const HELPER_ADDRESS: Address =
  "0x5555555555555555555555555555555555555555";

/** Config bindings wiring the module to the mock subgraph on the test fork. */
export const SET_BINDINGS = `set $aragonosx:subgraphUrl "${SUBGRAPH_URL}"
set $aragonosx:pluginSetupProcessor ${PSP_ADDRESS}`;

/** Preamble for command tests (describeHelper adds the load line itself). */
export const PREAMBLE = `load aragonosx
${SET_BINDINGS}`;

const plugin = (
  address: Address,
  repo: Address,
  subdomain: string,
  build = 2,
) => ({
  plugin: { id: address },
  appliedPluginRepo: { id: repo, subdomain },
  appliedVersion: { build, release: { release: 1 } },
  appliedPreparation: {
    pluginAddress: address,
    helpers: subdomain === "token-voting" ? [HELPER_ADDRESS] : [],
  },
});

/** Subgraph response for the fixture DAO. */
export const SUBGRAPH_DAO = {
  id: DAO_ADDRESS,
  subdomain: DAO_SUBDOMAIN,
  plugins: [
    plugin(ADMIN_PLUGIN, ADMIN_REPO, "admin"),
    plugin(MULTISIG_PLUGIN, MULTISIG_REPO, "multisig"),
    plugin(TOKEN_VOTING_PLUGIN, TOKEN_VOTING_REPO, "token-voting"),
    plugin(SPP_PLUGIN, SPP_REPO, "staged-proposal-processor"),
    plugin(MULTISIG_PLUGIN_2, MULTISIG_REPO, "multisig"),
  ],
};
