import type { Abi, AbiEvent, Log } from "viem";
import { decodeEventLog, getAbiItem, parseAbiItem } from "viem";

import type { BindingsManager } from "../BindingsManager";
import { ErrorException } from "../errors";
import type {
  EventCaptureBinding,
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
    // Build from inline signature: "event EventName(type1,type2,...)"
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

/**
 * Extract a value from decoded event args using an EventCaptureBinding.
 *
 * Supports:
 * - Named field access: `.fieldName`
 * - Indexed access: `:0`, `:1:0:1` (deep path)
 * - Default: index 0
 */
function extractValue(
  args: readonly unknown[] | Record<string, unknown>,
  binding: EventCaptureBinding,
  eventAbi: AbiEvent,
  eventName: string,
): unknown {
  let value: unknown;

  if (binding.fieldName) {
    // Named field access
    if (typeof args === "object" && args !== null && !Array.isArray(args)) {
      value = (args as Record<string, unknown>)[binding.fieldName];
    } else {
      // Args might be positional — find by name in ABI
      const paramIndex = eventAbi.inputs.findIndex(
        (input) => input.name === binding.fieldName,
      );
      if (paramIndex === -1) {
        throw new ErrorException(
          `field "${binding.fieldName}" not found in event "${eventName}"`,
        );
      }
      value = (args as readonly unknown[])[paramIndex];
    }

    if (value === undefined) {
      throw new ErrorException(
        `field "${binding.fieldName}" not found in event "${eventName}"`,
      );
    }

    // Apply sub-index path if present (e.g. .data:0:1)
    for (const idx of binding.indexPath) {
      if (!Array.isArray(value) && typeof value !== "object") {
        throw new ErrorException(
          `cannot index into non-array/non-tuple value at field "${binding.fieldName}" in event "${eventName}"`,
        );
      }
      const arr = value as unknown[];
      if (idx >= arr.length) {
        throw new ErrorException(
          `index ${idx} out of bounds for field "${binding.fieldName}" in event "${eventName}" (length ${arr.length})`,
        );
      }
      value = arr[idx];
    }
  } else {
    // Indexed access
    const indexPath = binding.indexPath.length > 0 ? binding.indexPath : [0];

    value = args;
    for (const idx of indexPath) {
      if (Array.isArray(value)) {
        if (idx >= value.length) {
          throw new ErrorException(
            `index path :${indexPath.join(":")} out of bounds for event "${eventName}"`,
          );
        }
        value = value[idx];
      } else if (typeof value === "object" && value !== null) {
        // viem returns named args as objects — convert to positional access
        const keys = Object.keys(value);
        if (idx >= keys.length) {
          throw new ErrorException(
            `index path :${indexPath.join(":")} out of bounds for event "${eventName}"`,
          );
        }
        value = (value as Record<string, unknown>)[keys[idx]];
      } else {
        throw new ErrorException(
          `cannot index into non-array/non-tuple value in event "${eventName}"`,
        );
      }
    }
  }

  return value;
}

/**
 * Convert a captured value to its string representation for storage in bindings.
 */
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
 * Resolve event captures from a transaction receipt.
 *
 * Decodes event logs and stores captured values as user bindings.
 *
 * @param receipt - The transaction receipt containing logs
 * @param abi - The contract ABI (may be undefined if all captures use inline signatures)
 * @param eventCaptures - The event capture nodes from the AST
 * @param bindingsManager - Where to store captured values
 * @param interpretNode - Node interpreter for resolving contract filter nodes
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

    // Filter logs by contract address if a filter is specified
    let logs = receipt.logs;
    if (capture.contractFilter) {
      const filterAddress = await interpretNode(capture.contractFilter);
      logs = logs.filter(
        (log) =>
          log.address.toLowerCase() === String(filterAddress).toLowerCase(),
      );
    }

    // Decode matching logs
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

    // Select occurrence
    const occurrenceIndex = capture.occurrence ?? 0;
    if (occurrenceIndex >= decodedLogs.length) {
      throw new ErrorException(
        `event "${capture.eventName}" occurrence #${occurrenceIndex} not found (only ${decodedLogs.length} emitted)`,
      );
    }

    const selectedLog = decodedLogs[occurrenceIndex];

    // Extract and store each capture binding
    for (const binding of capture.captures) {
      const value = extractValue(
        selectedLog.args,
        binding,
        eventAbi,
        capture.eventName,
      );

      bindingsManager.setBinding(
        `$${binding.variable}`,
        valueToString(value),
        USER,
        true,
        undefined,
        true,
      );
    }
  }
}
