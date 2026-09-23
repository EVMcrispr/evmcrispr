import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { isAddressEqual, zeroAddress } from "viem";
import type Safe from "..";
import { SENTINEL, safeDeployment } from "../addresses";
import {
  predictSafeAddress,
  SAFE_PROXY_CREATION_CODE,
  safeInitializer,
} from "../utils/deployment";
import { safeUint } from "../utils/offline";

export default defineHelper<Safe>({
  name: "address",
  description:
    "Predict the single-owner Safe address for safe:new with a deployment salt nonce, without RPC access.",
  returnType: "address",
  args: [
    {
      name: "owner",
      type: "address",
      description: "Initial sole owner (threshold 1)",
    },
    {
      name: "salt",
      type: "number",
      optional: true,
      description:
        "Deployment salt nonce, matching safe:new --salt (defaults to 0)",
    },
  ],
  async run(module, { owner, salt }) {
    if (isAddressEqual(owner, zeroAddress) || isAddressEqual(owner, SENTINEL))
      throw new ErrorException("owner must be a valid Safe owner");
    const deployment = safeDeployment(await module.getChainId());
    return predictSafeAddress(
      deployment,
      SAFE_PROXY_CREATION_CODE,
      safeInitializer([owner], 1n, deployment.fallbackHandler),
      safeUint(salt ?? 0n, "salt nonce"),
    );
  },
});
