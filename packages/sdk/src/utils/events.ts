import type { Abi, AbiEvent, Log } from "viem";
import { decodeEventLog, getAbiItem, parseAbiItem } from "viem";

import type { BindingsManager } from "../BindingsManager";
import { ErrorException } from "../errors";
import type {
  DestructureSlot,
  EventCaptureNode,
  NodeInterpreter,
} from "../types";
import { BindingsSpace } from "../types";

const { USER } = BindingsSpace;

/**
 * A receipt-like object containing logs. We use a minimal type
 * to avoid coupling to viem's full TransactionReceipt type.
 */
export interface ReceiptWithLogs {
  logs: Log[];
}

/**
 * Build an ABI event item from an EventCaptureNode.
 *
 * If `eventParams` is set (inline signature), constructs the event ABI from types.
 * Otherwise, looks up the event by name in the provided ABI.
 */
function getEventAbi(
  capture: EventCaptureNode,
  abi: Abi | undefined,
): AbiEvent {
  if (capture.eventParams && capture.eventParams.length > 0) {
    const sig = `event ${capture.eventName}(${capture.eventParams.join(",")})`;
    try {
      return parseAbiItem(sig) as AbiEvent;
    } catch (err) {
      const err_ = err as Error;
      throw new ErrorException(
        `invalid inline event signature "${sig}": ${err_.message}`,
      );
    }
  }

  if (!abi) {
    throw new ErrorException(
      `no ABI available for event "${capture.eventName}" decoding (use inline signature e.g. ${capture.eventName}(uint256,address))`,
    );
  }

  try {
    const item = getAbiItem({ abi, name: capture.eventName });
    if (!item || item.type !== "event") {
      throw new Error("not found");
    }
    return item as AbiEvent;
  } catch {
    throw new ErrorException(
      `event "${capture.eventName}" not found in contract ABI`,
    );
  }
}

function valueToString(value: unknown): string {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value.toString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  }
  return String(value);
}

/**
 * Convert viem decoded args (possibly a named object) to a positional array.
 */
function argsToArray(
  args: readonly unknown[] | Record<string, unknown>,
): unknown[] {
  if (Array.isArray(args)) return args as unknown[];
  if (typeof args === "object" && args !== null) {
    return Object.values(args);
  }
  return [args];
}

/**
 * Recursively walk a DestructureSlot[] pattern and store captured values
 * as user bindings. Variable names are without `$`; the prefix is added
 * when storing.
 */
function applyEventDestructure(
  slots: DestructureSlot[],
  args: unknown,
  eventName: string,
  bindingsManager: BindingsManager,
): void {
  const arr = argsToArray(args as readonly unknown[] | Record<string, unknown>);

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot === null) continue;
    if (i >= arr.length) {
      throw new ErrorException(
        `destructure index ${i} out of bounds for event "${eventName}" (${arr.length} args)`,
      );
    }
    if (typeof slot === "string") {
      bindingsManager.setBinding(
        `$${slot}`,
        valueToString(arr[i]),
        USER,
        true,
        undefined,
        true,
      );
    } else {
      applyEventDestructure(slot, arr[i], eventName, bindingsManager);
    }
  }
}

/**
 * Resolve event captures from a transaction receipt.
 *
 * Decodes event logs and stores captured values as user bindings.
 */
export async function resolveEventCaptures(
  receipt: ReceiptWithLogs,
  abi: Abi | undefined,
  eventCaptures: EventCaptureNode[],
  bindingsManager: BindingsManager,
  interpretNode: NodeInterpreter,
): Promise<void> {
  for (const capture of eventCaptures) {
    const eventAbi = getEventAbi(capture, abi);

    let logs = receipt.logs;
    if (capture.contractFilter) {
      const filterAddress = await interpretNode(capture.contractFilter);
      logs = logs.filter(
        (log) =>
          log.address.toLowerCase() === String(filterAddress).toLowerCase(),
      );
    }

    const decodedLogs: {
      args: readonly unknown[] | Record<string, unknown>;
    }[] = [];
    for (const log of logs) {
      try {
        const decoded = decodeEventLog({
          abi: [eventAbi],
          data: log.data,
          topics: log.topics as [
            signature: `0x${string}`,
            ...args: `0x${string}`[],
          ],
        });
        if (decoded.eventName === capture.eventName) {
          decodedLogs.push({
            args: decoded.args as readonly unknown[] | Record<string, unknown>,
          });
        }
      } catch {
        // Log doesn't match this event — skip
      }
    }

    if (decodedLogs.length === 0) {
      const filterInfo = capture.contractFilter
        ? ` from filtered contract`
        : "";
      throw new ErrorException(
        `event "${capture.eventName}" not found in transaction logs${filterInfo}`,
      );
    }

    const occurrenceIndex = capture.occurrence ?? 0;
    if (occurrenceIndex >= decodedLogs.length) {
      throw new ErrorException(
        `event "${capture.eventName}" occurrence #${occurrenceIndex} not found (only ${decodedLogs.length} emitted)`,
      );
    }

    const selectedLog = decodedLogs[occurrenceIndex];
    applyEventDestructure(
      capture.captures,
      selectedLog.args,
      capture.eventName,
      bindingsManager,
    );
  }
}
