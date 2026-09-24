import type { Address, NodesInterpreters } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { SmartBatchPlan } from "@evmcrispr/sdk/onchain";
import {
  type Hex,
  hashTypedData,
  isAddressEqual,
  recoverAddress,
  type TypedDataDefinition,
} from "viem";
import type Safe from "..";
import { normalizeSafeSignature, stringifySafeTransaction } from "./offline";
import {
  type SafeSignable,
  signableHashes,
  signableTypedData,
} from "./signables";

/** A Safe message's hashes, for signers to compare with their wallet. A
 *  transaction prints nothing: its progress shows in its status box, and a
 *  gated command refuses a blocking finding with an error. */
export function logSafeSignable(module: Safe, signable: SafeSignable): void {
  if (signable.kind === "transaction") return;
  const hashes = signableHashes(signable);
  const content =
    signable.content === undefined
      ? "  Content:          signing bytes of another Safe's transaction or message"
      : typeof signable.content === "string"
        ? `  Text:             ${JSON.stringify(signable.content)}`
        : "  Content:          EIP-712 typed data";
  module.context.log(
    [
      `Safe message (safe ${signable.safe}, chain ${signable.chainId})`,
      content,
      `  Domain hash:      ${hashes.domainHash}`,
      `  Message hash:     ${hashes.messageHash}`,
      `  SafeMessage hash: ${hashes.finalHash}`,
    ].join("\n"),
  );
}

/** Ask the connected wallet for its EIP-712 signature over a Safe transaction
 *  or Safe message. */
export async function requestSafeSignature(
  module: Safe,
  interpreters: NodesInterpreters,
  signable: SafeSignable,
  commandName: string,
  executionPlan?: SmartBatchPlan,
): Promise<{ owner: Address; signature: Hex }> {
  const { actionCallback } = interpreters;
  if (!actionCallback)
    throw new ErrorException(
      `${commandName} requires an execution context with wallet access`,
    );
  const sender = await module.getConnectedAccount(true);
  const signature = normalizeSafeSignature(
    await actionCallback({
      type: "wallet",
      executionPlan,
      method: "eth_signTypedData_v4",
      params: [sender, stringifySafeTransaction(signableTypedData(signable))],
    }),
  );
  const owner = await recoverAddress({
    hash: signableHashes(signable).finalHash,
    signature,
  });
  if (!isAddressEqual(owner, sender))
    throw new ErrorException(
      "wallet signature does not match the connected account",
    );
  return { owner, signature };
}

/** Ask the connected wallet for its EIP-712 signature over other typed data
 *  (a Safe Transaction Service delegate registration). */
export async function requestTypedDataSignature(
  module: Safe,
  interpreters: NodesInterpreters,
  typedData: {
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    domain: Record<string, unknown>;
    message: Record<string, unknown>;
  },
  commandName: string,
): Promise<{ signer: Address; signature: Hex }> {
  const { actionCallback } = interpreters;
  if (!actionCallback)
    throw new ErrorException(
      `${commandName} requires an execution context with wallet access`,
    );
  const signer = await module.getConnectedAccount(true);
  const signature = normalizeSafeSignature(
    await actionCallback({
      type: "wallet",
      method: "eth_signTypedData_v4",
      params: [signer, JSON.stringify(typedData)],
    }),
  );
  const recovered = await recoverAddress({
    hash: hashTypedData(typedData as unknown as TypedDataDefinition),
    signature,
  });
  if (!isAddressEqual(recovered, signer))
    throw new ErrorException(
      "wallet signature does not match the connected account",
    );
  return { signer, signature };
}
