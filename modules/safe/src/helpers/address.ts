import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { isAddressEqual, zeroAddress } from "viem";
import type Safe from "..";
import { SENTINEL, safeDeployment } from "../addresses";
import {
  multichainSafe,
  predictSafeAddress,
  SAFE_PROXY_CREATION_CODE,
} from "../utils/deployment";
import { safeUint } from "../utils/offline";

export default defineHelper<Safe>({
  name: "address",
  description:
    "Predict the single-owner Safe address for safe:new with a deployment salt nonce, without RPC access. The address is the same on every chain.",
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
    const { singleton, initializer } = multichainSafe(deployment, [owner], 1n);
    return predictSafeAddress(
      deployment,
      SAFE_PROXY_CREATION_CODE,
      initializer,
      safeUint(salt ?? 0n, "salt nonce"),
      singleton,
    );
  },
});
