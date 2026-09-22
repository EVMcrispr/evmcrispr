import type { Address } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import { toBigInt } from "../utils";
import {
  encodeSafeDeployment,
  predictSafeAddress,
  safeFactoryAbi,
  safeInitializer,
} from "../utils/deployment";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "static",
    reason: "Owners, threshold and salt determine the predicted Safe address.",
  },
  name: "new",
  description:
    "Deploy a new Safe (v1.4.1 L2 singleton) with the given owners, at a deterministic address.",
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
    const saltNonce = opts.salt !== undefined ? toBigInt(opts.salt) : 0n;
    const deployment = safeDeployment(await module.getChainId());
    const initializer = safeInitializer(
      owners as Address[],
      threshold,
      deployment.fallbackHandler,
    );
    const client = await module.getClient();
    const creationCode = await client.readContract({
      address: deployment.proxyFactory,
      abi: safeFactoryAbi,
      functionName: "proxyCreationCode",
    });
    const predicted = predictSafeAddress(
      deployment,
      creationCode,
      initializer,
      saltNonce,
    );

    module.context.log(`Deploying new Safe at ${predicted}`);

    return [encodeSafeDeployment(deployment, initializer, saltNonce)];
  },
});
