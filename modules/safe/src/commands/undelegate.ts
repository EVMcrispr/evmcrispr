import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import { requestTypedDataSignature } from "../utils/sign";
import {
  delegateTypedData,
  getDelegates,
  removeDelegate,
} from "../utils/txService";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "undelegate",
  description:
    "Remove a delegate of the Safe Transaction Service, as the owner who added it or as the delegate itself.",
  batchable: false,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    { name: "delegate", type: "address", description: "Delegate to remove" },
  ],
  async run(module, { safe, delegate }, { interpreters }) {
    const chainId = await module.getChainId();
    const account = await module.getConnectedAccount(true);
    const delegations = (
      await getDelegates(module, chainId, { safe, delegate })
    ).filter(
      (d) =>
        d.safe !== null &&
        isAddressEqual(d.safe, safe) &&
        (isAddressEqual(d.delegator, account) ||
          isAddressEqual(delegate, account)),
    );
    if (!delegations.length)
      throw new ErrorException(
        `${delegate} is not a delegate of Safe ${safe} that ${account} can remove`,
      );
    const { signature } = await requestTypedDataSignature(
      module,
      interpreters,
      delegateTypedData(chainId, delegate),
      "safe:undelegate",
    );
    for (const d of delegations)
      await removeDelegate(module, chainId, delegate, {
        safe: d.safe,
        delegator: d.delegator,
        signature,
      });
    module.context.log(
      `${delegate} can no longer propose transactions of Safe ${safe} for ${delegations.map((d) => d.delegator).join(", ")}`,
    );
    return [];
  },
});
