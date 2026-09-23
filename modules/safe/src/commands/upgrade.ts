import { defineCommand, ErrorException, encodeAction } from "@evmcrispr/sdk";
import {
  getAddress,
  isAddressEqual,
  keccak256,
  sliceHex,
  stringToHex,
  zeroAddress,
} from "viem";
import type Safe from "..";
import {
  KNOWN_FALLBACK_HANDLERS,
  KNOWN_L2_SINGLETONS,
  safeDeployment,
} from "../addresses";
import { assertSafeVersion } from "../utils";

const FALLBACK_HANDLER_SLOT = keccak256(
  stringToHex("fallback_manager.handler.address"),
);

export default defineCommand<Safe>({
  smartSupport: {
    kind: "static",
    reason:
      "The Safe's current singleton and fallback handler select the migration function at build time.",
  },
  name: "upgrade",
  description:
    "Upgrade the Safe to v1.5.0 with Safe's SafeMigration contract (a delegatecall from the Safe), keeping its L2 or plain flavour and any custom fallback handler.",
  args: [],
  opts: [
    {
      name: "l2",
      type: "bool",
      description:
        "Upgrade to the L2 (true) or plain (false) singleton; defaults to the flavour of the current one",
    },
    {
      name: "keep-fallback-handler",
      type: "bool",
      description:
        "Keep the current fallback handler even when it is an official one",
    },
  ],
  async run(module, _, { opts }) {
    if (!module.currentSafe)
      throw new ErrorException(
        "safe:upgrade can only be used inside a safe:propose, safe:propose-offline or safe:execute block",
      );
    const safe = await module.resolveSafe();
    const client = await module.getClient();
    const version = await assertSafeVersion(client, safe);
    if (version.startsWith("1.5.")) {
      module.context.log(`Safe ${safe} is already on v${version}`);
      return [];
    }
    const deployment = safeDeployment(await module.getChainId());
    const read = async (slot: `0x${string}`) =>
      getAddress(
        sliceHex(
          (await client.getStorageAt({ address: safe, slot })) ??
            `0x${"0".repeat(64)}`,
          12,
          32,
        ),
      );
    const [singleton, handler] = await Promise.all([
      read(`0x${"0".repeat(64)}`),
      read(FALLBACK_HANDLER_SLOT),
    ]);
    const l2 =
      opts.l2 ?? KNOWN_L2_SINGLETONS.some((a) => isAddressEqual(a, singleton));
    // Like Safe{Wallet}: an official (or missing) fallback handler moves to
    // the v1.5.0 one; a custom handler is the owners' choice and stays.
    const resetHandler =
      !opts["keep-fallback-handler"] &&
      (isAddressEqual(handler, zeroAddress) ||
        KNOWN_FALLBACK_HANDLERS.some((a) => isAddressEqual(a, handler)));
    const method = `${l2 ? "migrateL2" : "migrate"}${resetHandler ? "WithFallbackHandler" : "Singleton"}`;
    module.context.log(
      [
        `Upgrading Safe ${safe} from v${version} to v1.5.0 through SafeMigration ${deployment.migration} (${method}):`,
        `  singleton:        ${singleton} → ${l2 ? deployment.l2Singleton : deployment.singleton}`,
        `  fallback handler: ${resetHandler ? `${handler} → ${deployment.fallbackHandler}` : `${handler} (kept)`}`,
        ...(resetHandler
          ? [
              "  Note: the v1.5.0 fallback handler drops the legacy EIP-1271 check, so Safes below v1.5.0 that this Safe owns can no longer use its off-chain signatures (on-chain confirmations still work).",
            ]
          : []),
      ].join("\n"),
    );
    // Later commands in the block (safe:set-guard --module) check the
    // version on chain, which still reads the old one until the block runs.
    module.markUpgraded();
    return [
      {
        ...encodeAction(deployment.migration, `${method}()`, []),
        operation: 1,
      },
    ];
  },
});
