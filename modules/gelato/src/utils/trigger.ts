import { ErrorException, Num } from "@evmcrispr/sdk";
import type { Address, Hex } from "viem";
import { keccak256, toHex } from "viem";
import { parseDuration } from "./duration";
import type { Trigger } from "./moduleData";

/** The trigger options `gelato:automate` and `gelato:schedule` share. */
export const triggerOpts = [
  {
    name: "every",
    type: "number",
    description: "Run on an interval, e.g. 5m, 1h, 1d",
  },
  {
    name: "start",
    type: "number",
    description: "Unix timestamp (seconds) of the first --every execution",
  },
  {
    name: "cron",
    type: "string",
    description: 'Run on a cron schedule, e.g. "0 0 * * *"',
  },
  {
    name: "on",
    type: "address",
    description: "Contract whose --event triggers the task",
  },
  {
    name: "event",
    type: "string",
    description:
      'Event signature, e.g. "Deposit(address,uint256)", or a topic hash',
  },
  {
    name: "once",
    type: "bool",
    description: "Execute a single time, then the task cancels itself",
  },
] as const;

export const payOpt = {
  name: "pay",
  type: "address",
  description:
    "Fee token the target contract pays executions with (sync fee) instead of your Gas Tank",
} as const;

export function eventTopic(event: string): Hex {
  if (/^0x[0-9a-fA-F]{64}$/.test(event)) return event as Hex;
  const sig = event.replace(/\s+/g, "");
  if (!/^[A-Za-z_]\w*\([\w[\],]*\)$/.test(sig)) {
    throw new ErrorException(
      `--event must be an event signature like "Transfer(address,address,uint256)" or a topic hash, got ${event}`,
    );
  }
  return keccak256(toHex(sig));
}

export interface TriggerRules {
  /** Whether `--when`/`--check` (an on-chain resolver) are valid here. */
  allowResolver: boolean;
  /** Whether a task with no trigger and no `--once` is an error; a Web3
   *  Function task without one runs every block instead (Gelato's default). */
  needsTrigger: boolean;
}

/** Reject conflicting or dangling trigger options. */
export function validateTriggerOpts(
  opts: Record<string, unknown>,
  rules: TriggerRules,
): void {
  const names = rules.allowResolver
    ? ["every", "cron", "when", "on"]
    : ["every", "cron", "on"];
  const triggers = names.filter((o) => opts[o] !== undefined);
  if (triggers.length > 1) {
    throw new ErrorException(
      `pick one trigger, got --${triggers.join(" and --")}`,
    );
  }
  if (opts.check !== undefined && opts.when === undefined) {
    throw new ErrorException("--check needs --when <resolver>");
  }
  if ((opts.event === undefined) !== (opts.on === undefined)) {
    throw new ErrorException("--on and --event go together");
  }
  if (opts.start !== undefined && opts.every === undefined) {
    throw new ErrorException("--start only applies to --every tasks");
  }
  if (rules.needsTrigger && triggers.length === 0 && !opts.once) {
    throw new ErrorException(
      rules.allowResolver
        ? "a task needs a trigger: --every, --cron, --when, --on/--event or --once"
        : "a task needs a trigger: --every, --cron, --on/--event or --once",
    );
  }
}

/** Automate's TRIGGER module data for the options given (undefined when
 *  the task has none: `--when` resolvers and `--once` tasks). */
export function buildTrigger(
  opts: Record<string, unknown>,
  { defaultBlock }: { defaultBlock: boolean },
): Trigger | undefined {
  // Automate's TIME trigger takes milliseconds (automate-sdk convention).
  if (opts.every !== undefined) {
    const seconds = parseDuration(opts.every, "--every");
    const start =
      opts.start === undefined ? 0n : Num(opts.start).toBigInt() * 1000n;
    return { type: "time", start, interval: seconds * 1000n };
  }
  if (opts.cron !== undefined) {
    const expression = String(opts.cron).trim();
    if (expression.split(/\s+/).length !== 5) {
      throw new ErrorException(
        `--cron expects 5 fields like "0 0 * * *", got "${expression}"`,
      );
    }
    return { type: "cron", expression };
  }
  if (opts.on !== undefined) {
    return {
      type: "event",
      address: opts.on as Address,
      topics: [[eventTopic(String(opts.event))]],
      confirmations: 0n,
    };
  }
  if (defaultBlock && !opts.once) {
    // Gelato's own default for functions without a schedule: every block.
    return { type: "block" };
  }
  return undefined;
}
