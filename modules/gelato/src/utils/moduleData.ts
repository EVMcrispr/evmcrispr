import type { Address, Hex } from "viem";
import { encodeAbiParameters } from "viem";

/** LibDataTypes.Module — ids must be ascending and unique in a task. */
export const Module = {
  RESOLVER: 0,
  DEPRECATED_TIME: 1,
  PROXY: 2,
  SINGLE_EXEC: 3,
  WEB3_FUNCTION: 4,
  TRIGGER: 5,
} as const;

/** TriggerModule.TriggerType. */
export const TriggerType = {
  TIME: 0,
  CRON: 1,
  EVENT: 2,
  BLOCK: 3,
} as const;

export type Trigger =
  | { type: "time"; start: bigint; interval: bigint }
  | { type: "cron"; expression: string }
  | { type: "event"; address: Address; topics: Hex[][]; confirmations: bigint }
  | { type: "block" };

export interface TaskModules {
  resolver?: { address: Address; data: Hex };
  /** Execute through the creator's dedicated msg.sender (OpsProxy). */
  proxy?: boolean;
  singleExec?: boolean;
  /** Published function CID plus its ABI-encoded user args (see encodeUserArgs). */
  web3Function?: { cid: string; args: Hex };
  trigger?: Trigger;
}

export interface ModuleData {
  modules: number[];
  args: Hex[];
}

function encodeTrigger(trigger: Trigger): Hex {
  let inner: Hex;
  let type: number;
  switch (trigger.type) {
    case "time":
      type = TriggerType.TIME;
      inner = encodeAbiParameters(
        [{ type: "uint128" }, { type: "uint128" }],
        [trigger.start, trigger.interval],
      );
      break;
    case "cron":
      type = TriggerType.CRON;
      inner = encodeAbiParameters([{ type: "string" }], [trigger.expression]);
      break;
    case "event":
      type = TriggerType.EVENT;
      inner = encodeAbiParameters(
        [{ type: "address" }, { type: "bytes32[][]" }, { type: "uint256" }],
        [trigger.address, trigger.topics, trigger.confirmations],
      );
      break;
    case "block":
      type = TriggerType.BLOCK;
      inner = "0x";
      break;
  }
  return encodeAbiParameters(
    [{ type: "uint8" }, { type: "bytes" }],
    [type, inner],
  );
}

/** Encode Automate's ModuleData in enum order, as LibTaskModule requires. */
export function encodeModuleData(task: TaskModules): ModuleData {
  const entries: [number, Hex][] = [];
  if (task.resolver) {
    entries.push([
      Module.RESOLVER,
      encodeAbiParameters(
        [{ type: "address" }, { type: "bytes" }],
        [task.resolver.address, task.resolver.data],
      ),
    ]);
  }
  if (task.proxy) entries.push([Module.PROXY, "0x"]);
  if (task.singleExec) entries.push([Module.SINGLE_EXEC, "0x"]);
  if (task.web3Function) {
    entries.push([
      Module.WEB3_FUNCTION,
      encodeAbiParameters(
        [{ type: "string" }, { type: "bytes" }],
        [task.web3Function.cid, task.web3Function.args],
      ),
    ]);
  }
  if (task.trigger) entries.push([Module.TRIGGER, encodeTrigger(task.trigger)]);
  entries.sort((a, b) => a[0] - b[0]);
  return {
    modules: entries.map(([id]) => id),
    args: entries.map(([, arg]) => arg),
  };
}
