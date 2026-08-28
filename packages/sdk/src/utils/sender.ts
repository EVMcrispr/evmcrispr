import type { Address } from "viem";
import type { Module } from "../Module";

/**
 * Run `fn` with `sender` as the account the calls are sent from — what
 * `@sender` resolves to and what `batch` stamps as `from` — restoring the
 * previous one after. For block commands whose actions execute as another
 * account: a Safe, a forwarder, a DAO, a Gelato dedicated msg.sender.
 */
export async function withSender<T>(
  module: Module,
  sender: Address,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = await module.getSender().catch(() => undefined);
  module.context.setSender(sender);
  try {
    return await fn();
  } finally {
    module.context.setSender(previous);
  }
}
