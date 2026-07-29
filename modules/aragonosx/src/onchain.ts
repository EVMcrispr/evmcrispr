import type { Address } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getAddress, parseAbiItem } from "viem";
import type { OsxDeployment } from "./addresses";
import type { RawPlugin } from "./types";

const INSTALLATION_PREPARED = parseAbiItem(
  "event InstallationPrepared(address indexed sender, address indexed dao, bytes32 preparedSetupId, address indexed pluginSetupRepo, (uint8 release, uint16 build) versionTag, bytes data, address plugin, (address[] helpers, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) preparedSetupData)",
);
const UPDATE_PREPARED = parseAbiItem(
  "event UpdatePrepared(address indexed sender, address indexed dao, bytes32 preparedSetupId, address indexed pluginSetupRepo, (uint8 release, uint16 build) versionTag, (address plugin, address[] currentHelpers, bytes data) setupPayload, (address[] helpers, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) preparedSetupData, bytes initData)",
);
const INSTALLATION_APPLIED = parseAbiItem(
  "event InstallationApplied(address indexed dao, address indexed plugin, bytes32 preparedSetupId, bytes32 appliedSetupId)",
);
const UPDATE_APPLIED = parseAbiItem(
  "event UpdateApplied(address indexed dao, address indexed plugin, bytes32 preparedSetupId, bytes32 appliedSetupId)",
);
const UNINSTALLATION_APPLIED = parseAbiItem(
  "event UninstallationApplied(address indexed dao, address indexed plugin, bytes32 preparedSetupId)",
);

/** Block window per eth_getLogs request (public RPCs cap wide ranges). */
const LOG_CHUNK = 5_000_000n;

async function getLogsChunked(
  client: PublicClient,
  psp: Address,
  events: any[],
  dao: Address,
  fromBlock: bigint,
): Promise<any[]> {
  const latest = await client.getBlockNumber();
  const logs: any[] = [];
  for (let from = fromBlock; from <= latest; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n > latest ? latest : from + LOG_CHUNK - 1n;
    // `args` filters only work with a single event, so query them one by one
    // (`dao` is an indexed parameter on every PSP event we care about).
    const chunkLogs = await Promise.all(
      events.map((event) =>
        client.getLogs({
          address: psp,
          event,
          args: { dao },
          fromBlock: from,
          toBlock: to,
        }),
      ),
    );
    logs.push(
      ...chunkLogs
        .flat()
        .sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? a.logIndex - b.logIndex
            : a.blockNumber < b.blockNumber
              ? -1
              : 1,
        ),
    );
  }
  return logs;
}

/**
 * Reconstruct a DAO's installed plugins from PluginSetupProcessor events.
 * Used when no subgraph is available for the chain.
 */
export async function fetchDaoPluginsOnchain(
  client: PublicClient,
  deployment: OsxDeployment,
  dao: Address,
): Promise<RawPlugin[]> {
  const logs = await getLogsChunked(
    client,
    deployment.pluginSetupProcessor,
    [
      INSTALLATION_PREPARED,
      UPDATE_PREPARED,
      INSTALLATION_APPLIED,
      UPDATE_APPLIED,
      UNINSTALLATION_APPLIED,
    ],
    dao,
    deployment.pluginSetupProcessorBlock,
  );

  // Preparations by setup id, so applied events can recover version/helpers.
  const preparations = new Map<
    string,
    {
      plugin: Address;
      repoAddress: Address;
      versionTag: { release: number; build: number };
      helpers: Address[];
    }
  >();
  // Current state per plugin address; logs come ordered by block/log index.
  const installed = new Map<string, RawPlugin>();

  const reposBySubdomain = Object.entries(deployment.repos ?? {});

  for (const log of logs) {
    const { eventName, args } = log as any;

    if (eventName === "InstallationPrepared") {
      preparations.set(args.preparedSetupId, {
        plugin: getAddress(args.plugin),
        repoAddress: getAddress(args.pluginSetupRepo),
        versionTag: {
          release: Number(args.versionTag.release),
          build: Number(args.versionTag.build),
        },
        helpers: args.preparedSetupData.helpers.map(getAddress),
      });
    } else if (eventName === "UpdatePrepared") {
      preparations.set(args.preparedSetupId, {
        plugin: getAddress(args.setupPayload.plugin),
        repoAddress: getAddress(args.pluginSetupRepo),
        versionTag: {
          release: Number(args.versionTag.release),
          build: Number(args.versionTag.build),
        },
        helpers: args.preparedSetupData.helpers.map(getAddress),
      });
    } else if (
      eventName === "InstallationApplied" ||
      eventName === "UpdateApplied"
    ) {
      const plugin = getAddress(args.plugin);
      const preparation = preparations.get(args.preparedSetupId);
      const repoAddress = preparation?.repoAddress;
      const repoSubdomain = repoAddress
        ? reposBySubdomain.find(
            ([, address]) =>
              address.toLowerCase() === repoAddress.toLowerCase(),
          )?.[0]
        : undefined;

      installed.set(plugin.toLowerCase(), {
        address: plugin,
        repoAddress,
        repoSubdomain,
        versionTag: preparation?.versionTag,
        helpers: preparation?.helpers ?? [],
      });
    } else if (eventName === "UninstallationApplied") {
      installed.delete(getAddress(args.plugin).toLowerCase());
    }
  }

  return [...installed.values()];
}
