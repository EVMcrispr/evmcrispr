import { afterAll, describe, it } from "bun:test";
import { ErrorException, ExitSignal, RevertError } from "@evmcrispr/sdk";
import { expect, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import type { WalletClient } from "viem";
import { createWorkerEvml } from "../../../src/worker/client";
import { deserializeError, serializeError } from "../../../src/worker/protocol";

const workerEvml = createWorkerEvml(
  () => new Worker(new URL("./fixtures/worker-entry.ts", import.meta.url).href),
  {},
  { killGraceMs: 500 },
);

// The execute path only touches the wallet through action handlers; with a
// custom transaction handler the stub never needs to sign.
const stubWallet = {
  account: { address: TEST_ACCOUNT_ADDRESS },
} as unknown as WalletClient;

afterAll(() => {
  workerEvml.terminate();
});

describe("evml > worker", () => {
  describe("error serialization", () => {
    it("round-trips error classes for instanceof checks", () => {
      const revert = deserializeError(
        serializeError(new RevertError("boom", "0xdeadbeef")),
      );
      expect(revert).to.be.instanceOf(RevertError);
      expect((revert as RevertError).revertData).to.equal("0xdeadbeef");

      expect(
        deserializeError(serializeError(new ExitSignal())),
      ).to.be.instanceOf(ExitSignal);
      expect(
        deserializeError(serializeError(new ErrorException("nope"))),
      ).to.be.instanceOf(ErrorException);

      const plain = deserializeError(serializeError(new TypeError("t")));
      expect(plain.name).to.equal("TypeError");
      expect(plain.message).to.equal("t");
    });
  });

  describe("execute via worker", () => {
    it("interprets in the worker and dispatches actions on this thread", async () => {
      const logs: string[] = [];
      const lines: (number | null)[] = [];
      const result = await workerEvml
        .with({ onLog: (m) => logs.push(m), onLine: (l) => lines.push(l) })
        .script(
          [
            "set $target 0x1111111111111111111111111111111111111111",
            'print "before"',
            "exec $target transfer(address,uint256) 0x2222222222222222222222222222222222222222 5",
          ].join("\n"),
        )
        .execute(stubWallet, {
          prepareChains: false,
          handlers: {
            transaction: async (action) => ({
              to: action.to,
              value: 42n,
            }),
          },
        });

      expect(result.exited).to.be.false;
      expect(result.executed.length).to.equal(1);
      const [{ action, result: handlerResult }] = result.executed;
      expect((action as { to?: string }).to).to.equal(
        "0x1111111111111111111111111111111111111111",
      );
      // bigints survive the main→worker→main round trip
      expect((handlerResult as { value: bigint }).value).to.equal(42n);
      expect(logs).to.include("before");
      expect(lines[lines.length - 1]).to.be.null;
    });

    it("propagates script errors from the worker", async () => {
      try {
        await workerEvml
          .script("notarealcommand foo")
          .execute(stubWallet, { prepareChains: false });
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/notarealcommand/);
      }
    });

    it("reports a clean stop when the script exits", async () => {
      const result = await workerEvml
        .script('print "before"\nexit\nprint "after"')
        .execute(stubWallet, { prepareChains: false });
      expect(result.exited).to.be.true;
    });

    it("rejects immediately when the signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      try {
        await workerEvml.script("print 1").execute(stubWallet, {
          prepareChains: false,
          signal: controller.signal,
        });
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.equal("Execution cancelled");
      }
    });
  });

  describe("simulate via worker", () => {
    it("routes simulate requests and surfaces worker-side errors", async () => {
      // The fixture tag has no sim module registered, so the run must
      // reject with simulateScript's own error — proving the simulate
      // message reached the worker and its failure crossed back.
      try {
        await workerEvml.script("print 1").simulate();
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.match(/needs the sim module/);
      }
    });
  });

  describe("hard kill", () => {
    it("terminate() rejects runs pending on an unresponsive worker", async () => {
      const silent = createWorkerEvml(() => {
        return new Worker(
          new URL("./fixtures/silent-worker.ts", import.meta.url).href,
        );
      });
      const pending = silent
        .script("print 1")
        .execute(stubWallet, { prepareChains: false });
      // Give the run a beat to enqueue before killing the worker.
      await new Promise((resolve) => setTimeout(resolve, 50));
      silent.terminate();
      try {
        await pending;
        expect.fail("should have thrown");
      } catch (err) {
        expect((err as Error).message).to.equal("Execution cancelled");
      }
    });
  });
});
