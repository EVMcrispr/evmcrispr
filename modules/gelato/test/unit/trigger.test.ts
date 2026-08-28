import { describe, expect, it } from "bun:test";
import { keccak256, toHex } from "viem";
import { buildTrigger, validateTriggerOpts } from "../../src/utils/trigger";

const CHECKER = "0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71";

describe("validateTriggerOpts", () => {
  const strict = { allowResolver: true, needsTrigger: true };
  it("accepts one trigger", () => {
    expect(() => validateTriggerOpts({ every: 3600 }, strict)).not.toThrow();
    expect(() => validateTriggerOpts({ once: true }, strict)).not.toThrow();
  });
  it("rejects two triggers", () => {
    expect(() =>
      validateTriggerOpts({ every: 3600, cron: "0 0 * * *" }, strict),
    ).toThrow("pick one trigger, got --every and --cron");
  });
  it("treats --when as a trigger only where resolvers are allowed", () => {
    expect(() =>
      validateTriggerOpts({ every: 3600, when: CHECKER }, strict),
    ).toThrow("pick one trigger");
    expect(() =>
      validateTriggerOpts(
        { every: 3600, when: CHECKER },
        { ...strict, allowResolver: false },
      ),
    ).not.toThrow();
  });
  it("pairs --on with --event and --check with --when", () => {
    expect(() => validateTriggerOpts({ on: CHECKER }, strict)).toThrow(
      "--on and --event go together",
    );
    expect(() => validateTriggerOpts({ check: "f()" }, strict)).toThrow(
      "--check needs --when",
    );
    expect(() => validateTriggerOpts({ start: 1 }, strict)).toThrow(
      "--start only applies to --every",
    );
  });
  it("demands a trigger only when asked to", () => {
    expect(() => validateTriggerOpts({}, strict)).toThrow(
      "--every, --cron, --when, --on/--event or --once",
    );
    expect(() =>
      validateTriggerOpts({}, { allowResolver: false, needsTrigger: true }),
    ).toThrow("--every, --cron, --on/--event or --once");
    expect(() =>
      validateTriggerOpts({}, { allowResolver: false, needsTrigger: false }),
    ).not.toThrow();
  });
});

describe("buildTrigger", () => {
  it("converts --every and --start to milliseconds", () => {
    expect(
      buildTrigger({ every: 3600, start: 1700000000 }, { defaultBlock: false }),
    ).toEqual({
      type: "time",
      start: 1_700_000_000_000n,
      interval: 3_600_000n,
    });
  });
  it("validates cron fields", () => {
    expect(
      buildTrigger({ cron: " 0 0 * * * " }, { defaultBlock: false }),
    ).toEqual({
      type: "cron",
      expression: "0 0 * * *",
    });
    expect(() =>
      buildTrigger({ cron: "hourly" }, { defaultBlock: false }),
    ).toThrow("5 fields");
  });
  it("hashes event signatures", () => {
    expect(
      buildTrigger(
        { on: CHECKER, event: "Deposit(address, uint256)" },
        { defaultBlock: false },
      ),
    ).toEqual({
      type: "event",
      address: CHECKER,
      topics: [[keccak256(toHex("Deposit(address,uint256)"))]],
      confirmations: 0n,
    });
  });
  it("defaults to every block only for functions that are not one-shot", () => {
    expect(buildTrigger({}, { defaultBlock: true })).toEqual({ type: "block" });
    expect(
      buildTrigger({ once: true }, { defaultBlock: true }),
    ).toBeUndefined();
    expect(buildTrigger({}, { defaultBlock: false })).toBeUndefined();
  });
});
