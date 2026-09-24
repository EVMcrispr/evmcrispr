import type { Address } from "@evmcrispr/sdk";
import { defineCommand, ErrorException, fieldItem } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import { getOwners } from "../utils";
import { requestTypedDataSignature } from "../utils/sign";
import {
  addDelegate,
  delegateTypedData,
  getDelegates,
  removeDelegate,
} from "../utils/txService";

type Interpreters = Parameters<typeof requestTypedDataSignature>[1];

export default defineCommand<Safe>({
  smartSupport: {
    kind: "incompatible",
    reason:
      "This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.",
  },
  name: "delegate",
  description:
    "Add or remove an account that proposes Safe transactions on the Safe Transaction Service on behalf of the connected owner, without confirming them.",
  batchable: false,
  args: [
    {
      name: "action",
      type: "command",
      description:
        "Keyword `add`, or `remove` (as the owner who added the delegate, or as the delegate itself)",
    },
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "delegate",
      type: "address",
      description: "Account that proposes, other than an owner",
    },
  ],
  opts: [
    {
      name: "label",
      type: "string",
      description:
        "Name shown for the delegate (defaults to evmcrispr); add only",
    },
    {
      name: "expires",
      type: "number",
      description:
        "Unix timestamp after which the delegate can no longer propose, e.g. @date(now +30d); add only",
    },
  ],
  completions: {
    action: () => [fieldItem("add"), fieldItem("remove")],
  },
  async run(module, { action, safe, delegate }, { opts, interpreters }) {
    const chainId = await module.getChainId();
    if (action === "remove") {
      if (opts.label !== undefined || opts.expires !== undefined)
        throw new ErrorException(
          "--label and --expires only apply to safe:delegate add",
        );
      return remove(module, interpreters, chainId, safe, delegate);
    }
    if (action !== "add")
      throw new ErrorException(
        `expected the keyword add or remove, got "${action}"`,
      );
    return add(module, interpreters, chainId, safe, delegate, opts);
  },
});

async function add(
  module: Safe,
  interpreters: Interpreters,
  chainId: number,
  safe: Address,
  delegate: Address,
  opts: { label?: string; expires?: unknown },
): Promise<[]> {
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
  const expires = opts.expires !== undefined ? Number(opts.expires) : undefined;
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
}

/** The owner who added the delegate, or the delegate itself, removes it. */
async function remove(
  module: Safe,
  interpreters: Interpreters,
  chainId: number,
  safe: Address,
  delegate: Address,
): Promise<[]> {
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
    "safe:delegate",
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
}
