// What a POST_TX frame reads about its transaction: EIP-7906's TXTRACE and
// EVENTDATACOPY, in the Hegota devnet's revision (its parameter numbering
// is the hegota demo's TxTraceLib, measured on the chain on 2026-11-09).
import type { SimOpcodeResult, SimStateChanges } from "@evmcrispr/sdk";
import {
  type Address,
  concat,
  type Hex,
  hexToBigInt,
  size,
  sliceHex,
} from "viem";

export interface TraceEvent {
  address: Hex;
  topics: Hex[];
  data: Hex;
}

/** The transaction as its POST_TX frames see it. */
export interface FrameTrace {
  balances: SimStateChanges["balances"];
  slots: SimStateChanges["slots"];
  codes: SimStateChanges["codes"];
  events: TraceEvent[];
}

const order = (x: bigint, y: bigint) => (x < y ? -1 : x > y ? 1 : 0);
const byAddress = (a: { address: Address }, b: { address: Address }) =>
  order(BigInt(a.address), BigInt(b.address));

/** The trace of `changes` (net, since the transaction's start) and the logs
 *  of the body frames that took effect, in emission order. Entries sort
 *  ascending by address, storage then by slot. */
export function buildTrace(
  changes: SimStateChanges,
  logs: TraceEvent[],
): FrameTrace {
  return {
    balances: [...changes.balances].sort(byAddress),
    slots: [...changes.slots].sort(
      (a, b) => byAddress(a, b) || order(BigInt(a.slot), BigInt(b.slot)),
    ),
    codes: [...changes.codes].sort(byAddress),
    events: logs,
  };
}

/** TXTRACE parameter ids on the Hegota devnet. */
export const TRACE = {
  BALANCE_COUNT: 0x00,
  STORAGE_COUNT: 0x01,
  CONTRACT_COUNT: 0x02,
  BALANCE_ADDRESS: 0x03,
  BALANCE_BEFORE: 0x04,
  BALANCE_AFTER: 0x05,
  STORAGE_ADDRESS: 0x06,
  STORAGE_SLOT: 0x07,
  STORAGE_BEFORE: 0x08,
  STORAGE_AFTER: 0x09,
  CONTRACT_ADDR: 0x0a,
  CONTRACT_HASH: 0x0b,
  EVENT_COUNT: 0x0c,
  EVENT_ADDRESS: 0x0d,
  EVENT_TOPIC_CNT: 0x0e,
  EVENT_TOPIC0: 0x0f,
  EVENT_DATA_LEN: 0x13,
} as const;

const fail = (why: string): SimOpcodeResult => ({ fail: `TXTRACE: ${why}` });

/** TXTRACE(`param`, `in2`): a count (in2 must be 0), or a field of entry
 *  `in2`. An index out of range, a count's index other than 0, a missing
 *  topic or an unknown parameter halts the frame, as on the chain (the
 *  count's measured 2026-11-10, hegota-post-tx-probe (c)). */
export function txtrace(
  trace: FrameTrace,
  param: bigint,
  in2: bigint,
): SimOpcodeResult {
  const count = (n: number): SimOpcodeResult =>
    in2 === 0n
      ? { push: BigInt(n) }
      : fail(`a count's index must be 0, not ${in2}`);
  const entry = <T>(list: T[], read: (e: T) => bigint): SimOpcodeResult =>
    in2 < BigInt(list.length)
      ? { push: read(list[Number(in2)]!) }
      : fail(`index ${in2} out of range (${list.length} entries)`);
  switch (Number(param)) {
    case TRACE.BALANCE_COUNT:
      return count(trace.balances.length);
    case TRACE.STORAGE_COUNT:
      return count(trace.slots.length);
    case TRACE.CONTRACT_COUNT:
      return count(trace.codes.length);
    case TRACE.BALANCE_ADDRESS:
      return entry(trace.balances, (b) => BigInt(b.address));
    case TRACE.BALANCE_BEFORE:
      return entry(trace.balances, (b) => b.before);
    case TRACE.BALANCE_AFTER:
      return entry(trace.balances, (b) => b.after);
    case TRACE.STORAGE_ADDRESS:
      return entry(trace.slots, (s) => BigInt(s.address));
    case TRACE.STORAGE_SLOT:
      return entry(trace.slots, (s) => hexToBigInt(s.slot));
    case TRACE.STORAGE_BEFORE:
      return entry(trace.slots, (s) => hexToBigInt(s.before));
    case TRACE.STORAGE_AFTER:
      return entry(trace.slots, (s) => hexToBigInt(s.after));
    case TRACE.CONTRACT_ADDR:
      return entry(trace.codes, (c) => BigInt(c.address));
    case TRACE.CONTRACT_HASH:
      return entry(trace.codes, (c) => hexToBigInt(c.after));
    case TRACE.EVENT_COUNT:
      return count(trace.events.length);
    case TRACE.EVENT_ADDRESS:
      return entry(trace.events, (e) => BigInt(e.address));
    case TRACE.EVENT_TOPIC_CNT:
      return entry(trace.events, (e) => BigInt(e.topics.length));
    case TRACE.EVENT_DATA_LEN:
      return entry(trace.events, (e) => BigInt(size(e.data)));
  }
  const topic = Number(param) - TRACE.EVENT_TOPIC0;
  if (topic >= 0 && topic < 4) {
    const event = trace.events[Number(in2)];
    if (in2 >= BigInt(trace.events.length) || !event)
      return fail(`index ${in2} out of range (${trace.events.length} events)`);
    const word = event.topics[topic];
    return word === undefined
      ? fail(`event ${in2} has no topic ${topic}`)
      : { push: hexToBigInt(word) };
  }
  return fail(`unknown parameter 0x${param.toString(16)}`);
}

/** EVENTDATACOPY: `length` bytes of event `eventIndex`'s data, from
 *  `dataOffset`, written at `memOffset`. Past the data (even for length 0)
 *  or past the events, it halts. */
export function eventDataCopy(
  trace: FrameTrace,
  eventIndex: bigint,
  memOffset: bigint,
  dataOffset: bigint,
  length: bigint,
): SimOpcodeResult {
  const event = trace.events[Number(eventIndex)];
  if (eventIndex >= BigInt(trace.events.length) || !event)
    return {
      fail: `EVENTDATACOPY: event ${eventIndex} out of range (${trace.events.length} events)`,
    };
  if (dataOffset + length > BigInt(size(event.data)))
    return {
      fail: `EVENTDATACOPY: ${dataOffset} + ${length} past the event's ${size(event.data)} bytes of data`,
    };
  const data =
    length === 0n
      ? "0x"
      : sliceHex(event.data, Number(dataOffset), Number(dataOffset + length));
  return { write: { offset: memOffset, data: concat([data]) } };
}
