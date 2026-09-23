import type {
  Action,
  Address,
  BlockExpressionNode,
  NodesInterpreters,
  TransactionAction,
} from "@evmcrispr/sdk";
import { ErrorException, Num, withSender } from "@evmcrispr/sdk";
import type { SmartBatchPlan } from "@evmcrispr/sdk/onchain";
import {
  compileSmartBatch,
  lowerSmartBatch,
  verifySmartDeployment,
} from "@evmcrispr/sdk/onchain";
import { isAddressEqual } from "viem";
import type Safe from "..";
import { looksLikeTypedData } from "./hashes";
import { assertAllTransactionActions } from "./safeTx";
import {
  parseSafeSignable,
  type SafeMessageContent,
  type SafeSignable,
} from "./signables";

export * from "./guards";
export * from "./hashes";
export * from "./multisend";
export * from "./reads";
export * from "./safeTx";
export * from "./txService";
export * from "./zodiac";

const smartPlans = new WeakMap<TransactionAction[], SmartBatchPlan>();
export const smartPlanFor = (actions?: TransactionAction[]) =>
  actions && smartPlans.get(actions);

/** 32 bytes of hex: a safeTxHash, or a safeMessageHash with `--message`. */
export const SAFE_TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** What a Safe command's main argument names. The command name says where
 *  the result goes; this says what it acts on. */
export type SafeInput =
  | { kind: "block"; block: BlockExpressionNode }
  | { kind: "nonce"; nonce: bigint }
  | { kind: "txHash"; hash: `0x${string}` }
  | { kind: "messageHash"; hash: `0x${string}` }
  /** Safe transaction or Safe message JSON of this Safe. */
  | { kind: "signable"; signable: SafeSignable }
  /** Safe transaction or Safe message JSON of another Safe: this Safe signs
   *  it as a nested owner. */
  | { kind: "nested"; parent: SafeSignable }
  /** A new Safe message: EIP-191 text or EIP-712 typed data. */
  | { kind: "content"; content: SafeMessageContent };
export type SafeInputKind = SafeInput["kind"];

const INPUT_LABELS: Record<SafeInputKind, string> = {
  block: "a command block",
  nonce: "a nonce",
  txHash: "a safeTxHash",
  messageHash: "a safeMessageHash (with --message)",
  signable: "Safe transaction or Safe message JSON",
  nested: "another Safe's transaction or message JSON",
  content: "a message (text or EIP-712 typed data)",
};

export const classifySafeInput = (
  value: unknown,
  {
    chainId,
    safe,
    message,
  }: { chainId: number; safe: Address; message?: boolean },
): SafeInput => {
  if (value && typeof value === "object" && "type" in value) {
    if (message)
      throw new ErrorException("--message only applies to a 32-byte hash");
    return { kind: "block", block: value as BlockExpressionNode };
  }
  if (typeof value !== "string") {
    if (message)
      throw new ErrorException("--message only applies to a 32-byte hash");
    return { kind: "nonce", nonce: toBigInt(value) };
  }
  if (SAFE_TX_HASH.test(value))
    return {
      kind: message ? "messageHash" : "txHash",
      hash: value as `0x${string}`,
    };
  if (message)
    throw new ErrorException("--message only applies to a 32-byte hash");
  let parsed: unknown;
  if (value.trim().startsWith("{")) {
    try {
      parsed = JSON.parse(value);
    } catch (e) {
      throw new ErrorException(
        `argument looks like JSON but could not be parsed: ${(e as Error).message}`,
      );
    }
  }
  if (parsed === undefined) return { kind: "content", content: value };
  if (parsed && typeof parsed === "object" && "kind" in parsed) {
    const signable = parseSafeSignable(parsed, chainId);
    return isAddressEqual(signable.safe, safe)
      ? { kind: "signable", signable }
      : { kind: "nested", parent: signable };
  }
  if (looksLikeTypedData(parsed))
    return { kind: "content", content: parsed as SafeMessageContent };
  throw new ErrorException(
    "unrecognized JSON: expected Safe transaction or Safe message JSON, or EIP-712 typed data",
  );
};

/** Throw unless `input` is one of `accepted`, naming what the command takes. */
export function acceptSafeInput<K extends SafeInputKind>(
  input: SafeInput,
  accepted: readonly K[],
  commandName: string,
): asserts input is Extract<SafeInput, { kind: K }> {
  if ((accepted as readonly SafeInputKind[]).includes(input.kind)) return;
  const labels = accepted.map((k) => INPUT_LABELS[k]);
  throw new ErrorException(
    `${commandName} accepts ${labels.length > 1 ? `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}` : labels[0]}, not ${INPUT_LABELS[input.kind]}`,
  );
}

export const toBigInt = (value: unknown): bigint => {
  if (value instanceof Num) return value.toBigInt();
  if (typeof value === "bigint") return value;
  return BigInt(String(value));
};

/**
 * Interpret the trailing block of `safe:propose` / `safe:execute` with the
 * target Safe pushed as the module's current Safe context, and collect the
 * inner transaction actions.
 */
export const interpretSafeBlock = async (
  module: Safe,
  safe: Address,
  block: BlockExpressionNode,
  commandName: string,
  interpreters: NodesInterpreters,
  options: { salt?: `0x${string}` } = {},
): Promise<TransactionAction[]> => {
  let actions: Action[];
  let pushed = false;
  try {
    if (block.smart) {
      const plan = await compileSmartBatch(module, block, interpreters, {
        name: commandName,
        account: safe,
        route: "delegatecall",
        salt: options.salt,
        blockInitializer: async () => {
          module.pushSafe(safe);
          pushed = true;
        },
      });
      if (plan.steps.length)
        await verifySmartDeployment(await module.getClient(), plan);
      const lowered = lowerSmartBatch(plan);
      smartPlans.set(lowered, plan);
      return lowered;
    }
    // The block's calls execute from the Safe: `@sender` is the Safe.
    actions = (await withSender(module, safe, () =>
      interpreters.interpretNode(block, {
        // Safe commands work unprefixed inside the block (like aragonos
        // connect); std commands (`exec`, `batch`, …) resolve via the usual
        // std fallback since no safe command shadows them.
        blockInitializer: async () => {
          module.pushSafe(safe);
          pushed = true;
        },
        // Inherit hasActions from any enclosing batch context: reads inside
        // this block can't see the outer batch's actions either.
        batchContext: {
          name: commandName,
          hasActions: interpreters.batchContext?.hasActions ?? false,
        },
      }),
    )) as Action[];
  } finally {
    if (pushed) module.popSafe();
  }

  return assertAllTransactionActions(actions, commandName);
};
