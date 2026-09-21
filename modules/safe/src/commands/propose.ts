import type { BlockExpressionNode } from "@evmcrispr/sdk";
import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import { isAddressEqual } from "viem";
import type Safe from "..";
import { safeDeployment } from "../addresses";
import {
  assertSafeVersion,
  buildSafeTx,
  collectSafeTxWarnings,
  formatSafeTxHashesLog,
  getNextNonce,
  getOwners,
  getQueueLink,
  getSafeNonce,
  getSafeTxHashes,
  getSafeTxTypedData,
  interpretSafeBlock,
  proposeTransaction,
} from "../utils";
import {
  normalizeSafeSignature,
  safeUint,
  stringifySafeTransaction,
  validateSafeSignatures,
} from "../utils/offline";
import {
  bindSafeOutput,
  mergeSafePackages,
  parseSafePackage,
  transactionPackage,
} from "../utils/packages";

export default defineCommand<Safe>({
  name: "propose",
  description:
    "Propose a signed transaction to the Safe queue, or prepare and sign portable transaction JSON with --no-api.",
  batchable: false,
  createsBatchContext: true,
  args: [
    { name: "safe", type: "address", description: "Safe address" },
    {
      name: "block",
      type: ["block", "string"],
      description:
        "Commands composing the transaction, or exported transaction JSON with --no-api",
    },
  ],
  opts: [
    {
      name: "as",
      type: "variable",
      description:
        "Bind the exported package to a variable (requires --no-api)",
    },
    {
      name: "no-api",
      type: "bool",
      description:
        "Export transaction JSON and collect signatures locally without contacting the Safe Transaction Service",
    },
    {
      name: "unsigned",
      type: "bool",
      description:
        "Prepare transaction JSON without a wallet signature (requires --no-api)",
    },
    {
      name: "nonce",
      type: "number",
      description:
        "Safe nonce override for a block (defaults to the next free service nonce, or the on-chain nonce with --no-api)",
    },
    {
      name: "origin",
      type: "string",
      description: "Origin tag shown in the Safe UI",
    },
  ],
  async run(module, { safe, block }, { opts, interpreters }) {
    const noApi = opts["no-api"];
    if (noApi && !opts.unsigned && interpreters.simulation)
      throw new ErrorException(
        "signed local proposals require real wallet access outside simulation",
      );
    if (opts.as && !noApi) throw new ErrorException("--as requires --no-api");
    if (!noApi && (opts.unsigned || typeof block === "string")) {
      throw new ErrorException(
        "transaction JSON and --unsigned require --no-api",
      );
    }
    if (noApi && opts.origin !== undefined) {
      throw new ErrorException(
        "--origin is only used by the Safe Transaction Service",
      );
    }
    if (typeof block === "string" && opts.nonce !== undefined) {
      throw new ErrorException(
        "--nonce cannot override an imported transaction",
      );
    }
    const actions =
      typeof block === "string"
        ? undefined
        : await interpretSafeBlock(
            module,
            safe,
            block as BlockExpressionNode,
            "safe:propose",
            interpreters,
          );

    if (actions?.length === 0) {
      return [];
    }

    const { actionCallback } = interpreters;
    if (!opts.unsigned && !actionCallback) {
      throw new ErrorException(
        "safe:propose requires an execution context with wallet access",
      );
    }

    const chainId = await module.getChainId();
    const client = await module.getClient();
    await assertSafeVersion(client, safe);

    const imported =
      typeof block === "string"
        ? parseSafePackage(block, chainId, safe)
        : undefined;
    if (imported && imported.kind !== "transaction")
      throw new ErrorException("expected transaction package");
    const tx =
      imported?.tx ??
      buildSafeTx(
        actions!,
        opts.nonce !== undefined
          ? safeUint(opts.nonce, "nonce")
          : noApi
            ? await getSafeNonce(client, safe)
            : await getNextNonce(module, client, chainId, safe),
        safeDeployment(chainId),
      );
    const { nonce } = tx;
    const hashes = getSafeTxHashes(chainId, safe, tx);
    const { safeTxHash } = hashes;
    const signatures = imported?.signatures ?? [];
    const owners = noApi ? await getOwners(client, safe) : undefined;

    // Print the hashes before the wallet prompt so the signer can compare
    // them against the hardware wallet display.
    module.context.log(
      formatSafeTxHashesLog(
        safe,
        chainId,
        tx,
        hashes,
        collectSafeTxWarnings(tx, safeDeployment(chainId)),
      ),
    );

    if (opts.unsigned) {
      const output = stringifySafeTransaction(
        await mergeSafePackages(
          transactionPackage(chainId, safe, tx, signatures),
          [],
        ),
      );
      bindSafeOutput(module, opts.as, output);
      module.context.log(output);
      return [];
    }

    const sender = await module.getConnectedAccount(true);
    if (owners && !owners.some((owner) => isAddressEqual(owner, sender))) {
      throw new ErrorException(
        `connected account ${sender} is not an owner of Safe ${safe}`,
      );
    }
    const signature = (await actionCallback!({
      type: "wallet",
      method: "eth_signTypedData_v4",
      params: [
        sender,
        stringifySafeTransaction(getSafeTxTypedData(chainId, safe, tx)),
      ],
    })) as `0x${string}`;

    if (noApi) {
      const normalized = normalizeSafeSignature(signature);
      const [signed] = await validateSafeSignatures(
        safeTxHash,
        [normalized],
        owners!,
      );
      if (!isAddressEqual(signed.owner, sender)) {
        throw new ErrorException(
          "wallet signature does not match the connected account",
        );
      }
      const output = stringifySafeTransaction(
        await mergeSafePackages(
          transactionPackage(chainId, safe, tx, signatures),
          [normalized],
        ),
      );
      bindSafeOutput(module, opts.as, output);
      module.context.log(output);
      return [];
    }

    await proposeTransaction(module, chainId, {
      safe,
      tx,
      safeTxHash,
      sender,
      signature,
      origin: opts.origin ?? "evmcrispr",
    });

    module.context.log(
      `Proposed Safe transaction ${safeTxHash} (nonce ${nonce}): ${getQueueLink(chainId, safe)}`,
    );

    return [];
  },
});
