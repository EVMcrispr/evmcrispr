import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import { getOwners } from "../utils";
import { requestTypedDataSignature } from "../utils/sign";
import { addDelegate, delegateTypedData } from "../utils/txService";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "delegate",
  description:
    "Let an account propose Safe transactions on the Safe Transaction Service on behalf of the connected owner, without confirming them.",
  batchable: false,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "delegate",
      type: "address",
      description: "Account that may propose, other than an owner",
    },
  ],
  opts: [
    {
      name: "label",
      type: "string",
      description: "Name shown for the delegate (defaults to evmcrispr)",
    },
    {
      name: "expires",
      type: "number",
      description:
        "Unix timestamp after which the delegate can no longer propose, e.g. @date(now +30d)",
    },
  ],
  async run(module, { safe, delegate }, { opts, interpreters }) {
    const chainId = await module.getChainId();
    const owners = await getOwners(await module.getClient(), safe);
    const owner = await module.getConnectedAccount(true);
    if (!owners.some((o) => isAddressEqual(o, owner)))
      throw new ErrorException(
        `${owner} is not an owner of Safe ${safe}: only an owner can add a delegate`,
      );
    // The service treats an owner as an owner: its proposals would still
    // count as confirmations.
    if (owners.some((o) => isAddressEqual(o, delegate)))
      throw new ErrorException(
        `${delegate} is an owner of Safe ${safe}: an owner proposes unsigned with safe:propose, and a delegate must be another account`,
      );
    const expires =
      opts.expires !== undefined ? Number(opts.expires) : undefined;
    if (expires !== undefined && !(expires * 1000 > Date.now()))
      throw new ErrorException("--expires must be a future Unix timestamp");
    const { signature } = await requestTypedDataSignature(
      module,
      interpreters,
      delegateTypedData(chainId, delegate),
      "safe:delegate",
    );
    await addDelegate(module, chainId, {
      safe,
      delegate,
      delegator: owner,
      signature,
      label: opts.label ?? "evmcrispr",
      expiryDate:
        expires !== undefined ? new Date(expires * 1000).toISOString() : null,
    });
    module.context.log(
      `${delegate} can now propose transactions of Safe ${safe} for ${owner}${expires !== undefined ? ` until ${new Date(expires * 1000).toISOString()}` : ""}, without confirming them`,
    );
    return [];
  },
});
