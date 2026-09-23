import type { Address } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import { toBigInt } from "../utils";
import {
  encodeSafeDeployment,
  multichainSafe,
  predictSafeAddress,
  SAFE_PROXY_CREATION_CODE,
} from "../utils/deployment";
import { safeUint } from "../utils/offline";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "static",
    reason: "Owners, threshold and salt determine the predicted Safe address.",
  },
  name: "new",
  description:
    "Deploy a new Safe v1.5.0 with the given owners, at a deterministic address that is the same on every chain for the same owners, threshold and salt (created like Safe{Wallet} creates Safes: switched to the L2 singleton on every chain but Ethereum mainnet).",
  args: [
    {
      name: "owners",
      type: "address",
      rest: true,
      description: "Owner addresses",
    },
  ],
  opts: [
    {
      name: "threshold",
      type: "number",
      description: "Signature threshold (defaults to 1)",
    },
    {
      name: "salt",
      type: "number",
      description: "Deployment salt nonce (defaults to 0)",
    },
  ],
  async run(module, { owners }, { opts }) {
    if (!owners?.length) {
      throw new ErrorException("at least one owner is required");
    }

    const threshold =
      opts.threshold !== undefined ? toBigInt(opts.threshold) : 1n;
    if (threshold < 1n || threshold > BigInt(owners.length)) {
      throw new ErrorException(
        `threshold must be between 1 and ${owners.length} (the number of owners)`,
      );
    }
    const saltNonce = safeUint(opts.salt ?? 0n, "salt nonce");
    const deployment = safeDeployment(await module.getChainId());
    const { singleton, initializer } = multichainSafe(
      deployment,
      owners as Address[],
      threshold,
    );
    const predicted = predictSafeAddress(
      deployment,
      SAFE_PROXY_CREATION_CODE,
      initializer,
      saltNonce,
      singleton,
    );

    module.context.log(`Deploying new Safe at ${predicted}`);

    return [
      encodeSafeDeployment(deployment, initializer, saltNonce, singleton),
    ];
  },
});
