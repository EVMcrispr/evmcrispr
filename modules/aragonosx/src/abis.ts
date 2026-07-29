import { parseAbi } from "viem";

/**
 * Minimal hand-curated OSx ABIs (v1.4). Bundled so commands never need to
 * fetch ABIs over HTTP.
 *
 * Recurring tuple shapes:
 * - Action:                (address to, uint256 value, bytes data)
 * - PluginRepo.Tag:        (uint8 release, uint16 build)
 * - PluginSetupRef:        (Tag versionTag, address pluginSetupRepo)
 * - MultiTargetPermission: (uint8 operation, address where, address who,
 *                           address condition, bytes32 permissionId)
 * - PreparedSetupData:     (address[] helpers, MultiTargetPermission[] permissions)
 * - SetupPayload:          (address plugin, address[] currentHelpers, bytes data)
 */

export const DAO_ABI = parseAbi([
  "function execute(bytes32 callId, (address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap) returns (bytes[] execResults, uint256 failureMap)",
  "function grant(address where, address who, bytes32 permissionId)",
  "function grantWithCondition(address where, address who, bytes32 permissionId, address condition)",
  "function revoke(address where, address who, bytes32 permissionId)",
  "function hasPermission(address where, address who, bytes32 permissionId, bytes data) view returns (bool)",
  "function daoURI() view returns (string)",
]);

export const PSP_ABI = parseAbi([
  "function prepareInstallation(address dao, (((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, bytes data) params) returns (address plugin, (address[] helpers, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) preparedSetupData)",
  "function applyInstallation(address dao, (((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, address plugin, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions, bytes32 helpersHash) params)",
  "function prepareUpdate(address dao, ((uint8 release, uint16 build) currentVersionTag, (uint8 release, uint16 build) newVersionTag, address pluginSetupRepo, (address plugin, address[] currentHelpers, bytes data) setupPayload) params) returns (bytes initData, (address[] helpers, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) preparedSetupData)",
  "function applyUpdate(address dao, (address plugin, ((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, bytes initData, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions, bytes32 helpersHash) params)",
  "function prepareUninstallation(address dao, (((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, (address plugin, address[] currentHelpers, bytes data) setupPayload) params) returns ((uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions)",
  "function applyUninstallation(address dao, (address plugin, ((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) params)",
  "event InstallationPrepared(address indexed sender, address indexed dao, bytes32 preparedSetupId, address indexed pluginSetupRepo, (uint8 release, uint16 build) versionTag, bytes data, address plugin, (address[] helpers, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) preparedSetupData)",
  "event InstallationApplied(address indexed dao, address indexed plugin, bytes32 preparedSetupId, bytes32 appliedSetupId)",
  "event UpdateApplied(address indexed dao, address indexed plugin, bytes32 preparedSetupId, bytes32 appliedSetupId)",
  "event UninstallationApplied(address indexed dao, address indexed plugin, bytes32 preparedSetupId)",
]);

export const PLUGIN_REPO_ABI = parseAbi([
  "function latestRelease() view returns (uint8)",
  "function getLatestVersion(uint8 release) view returns (((uint8 release, uint16 build) tag, address pluginSetup, bytes buildMetadata) version)",
  "function getVersion((uint8 release, uint16 build) tag) view returns (((uint8 release, uint16 build) tag, address pluginSetup, bytes buildMetadata) version)",
]);

const MULTI_TARGET_PERMISSION_COMPONENTS = [
  { name: "operation", type: "uint8" },
  { name: "where", type: "address" },
  { name: "who", type: "address" },
  { name: "condition", type: "address" },
  { name: "permissionId", type: "bytes32" },
] as const;

// abitype's type-level parser can't digest createDao's triple-nested return
// tuple, so this one is spelled out as a JSON ABI.
export const DAO_FACTORY_ABI = [
  {
    type: "function",
    name: "createDao",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "daoSettings",
        type: "tuple",
        components: [
          { name: "trustedForwarder", type: "address" },
          { name: "daoURI", type: "string" },
          { name: "subdomain", type: "string" },
          { name: "metadata", type: "bytes" },
        ],
      },
      {
        name: "pluginSettings",
        type: "tuple[]",
        components: [
          {
            name: "pluginSetupRef",
            type: "tuple",
            components: [
              {
                name: "versionTag",
                type: "tuple",
                components: [
                  { name: "release", type: "uint8" },
                  { name: "build", type: "uint16" },
                ],
              },
              { name: "pluginSetupRepo", type: "address" },
            ],
          },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "createdDao", type: "address" },
      {
        name: "installedPlugins",
        type: "tuple[]",
        components: [
          { name: "plugin", type: "address" },
          {
            name: "preparedSetupData",
            type: "tuple",
            components: [
              { name: "helpers", type: "address[]" },
              {
                name: "permissions",
                type: "tuple[]",
                components: MULTI_TARGET_PERMISSION_COMPONENTS,
              },
            ],
          },
        ],
      },
    ],
  },
] as const;
