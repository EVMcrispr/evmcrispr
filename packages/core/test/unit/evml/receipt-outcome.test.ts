import { describe, expect, it } from "bun:test";
import type { TransactionAction } from "@evmcrispr/sdk";
import { checkReceiptOutcome } from "../../../src/evml/execute";

const address = "0x1111111111111111111111111111111111111111";
const successTopic = `0x${"11".repeat(32)}` as const;
const failureTopic = `0x${"22".repeat(32)}` as const;
const id = `0x${"33".repeat(32)}` as const;
const action: TransactionAction = {
  to: address,
  receiptCheck: { address, successTopic, failureTopic, eventIdentifier: id },
};
describe("receipt event outcomes", () => {
  for (const indexed of [false, true]) {
    const log = (topic: string) => ({
      address,
      topics: indexed ? [topic, id] : [topic],
      data: indexed ? "0x" : id,
    });
    it(`checks ${indexed ? "indexed" : "unindexed"} identifiers and distinguishes inner failure`, () => {
      expect(() =>
        checkReceiptOutcome(action, { logs: [log(successTopic)] }),
      ).not.toThrow();
      expect(() =>
        checkReceiptOutcome(action, { logs: [log(failureTopic)] }),
      ).toThrow("ExecutionFailure");
      expect(() =>
        checkReceiptOutcome(action, {
          logs: [
            {
              ...log(successTopic),
              address: "0x2222222222222222222222222222222222222222",
            },
          ],
        }),
      ).toThrow("missing");
      expect(() =>
        checkReceiptOutcome(action, {
          logs: [
            indexed
              ? { ...log(successTopic), topics: [successTopic, failureTopic] }
              : { ...log(successTopic), data: failureTopic },
          ],
        }),
      ).toThrow("missing");
    });
  }
});
