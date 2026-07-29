import type { ConfigDef } from "@evmcrispr/sdk";

// Literal-only declarations: docs generation parses this file from source.
// These override (or, on chains without a known deployment, define) the OSx
// deployment used by the module — see getDeployment in addresses.ts.
export const configs: ConfigDef[] = [
  {
    name: "daoFactory",
    type: "address",
    description: "Override the OSx DAOFactory address.",
  },
  {
    name: "daoRegistry",
    type: "address",
    description: "Override the OSx DAORegistry address.",
  },
  {
    name: "pluginSetupProcessor",
    type: "address",
    description: "Override the OSx PluginSetupProcessor address.",
  },
  {
    name: "pluginSetupProcessorBlock",
    type: "number",
    description:
      "Deployment block of the PluginSetupProcessor, used to bound event scans.",
  },
  {
    name: "pluginRepoFactory",
    type: "address",
    description: "Override the OSx PluginRepoFactory address.",
  },
  {
    name: "pluginRepoRegistry",
    type: "address",
    description: "Override the OSx PluginRepoRegistry address.",
  },
  {
    name: "managementDao",
    type: "address",
    description: "Override the OSx management DAO address.",
  },
  {
    name: "daoEnsDomain",
    type: "string",
    description: "Override the ENS domain DAO names are registered under.",
  },
  {
    name: "pluginEnsDomain",
    type: "string",
    description: "Override the ENS domain plugin repos are registered under.",
  },
  {
    name: "subgraphUrl",
    type: "string",
    description: "Override the OSx subgraph endpoint for the current chain.",
  },
  {
    name: "adminRepo",
    type: "address",
    description: "Override the admin plugin repo address.",
  },
  {
    name: "multisigRepo",
    type: "address",
    description: "Override the multisig plugin repo address.",
  },
  {
    name: "tokenVotingRepo",
    type: "address",
    description: "Override the token-voting plugin repo address.",
  },
  {
    name: "stagedProposalProcessorRepo",
    type: "address",
    description: "Override the staged-proposal-processor plugin repo address.",
  },
];
