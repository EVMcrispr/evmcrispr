import { describe, it } from "bun:test";
import type { TransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { encodeFunctionData, toFunctionSelector, zeroAddress } from "viem";
import { CANONICAL_DEPLOYMENT as D } from "../../src/addresses";
import {
  type AllowOpts,
  assessCompeting,
  assessReviewState,
  assessSafeTx,
  blockedBy,
  enforceFindings,
  requiredOptions,
  SAFE_SELF_ABI,
  type SafeState,
} from "../../src/utils/assess";
import { buildSafeTx, type SafeTx } from "../../src/utils/safeTx";
import {
  decodeSafeTxCalls,
  expectKind,
  reviewSafeSignable,
  transactionSignable,
} from "../../src/utils/signables";

const SAFE = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;
const A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as const;
const B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as const;
const C = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as const;
const SENTINEL = "0x0000000000000000000000000000000000000001" as const;

const self = (
  functionName: (typeof SAFE_SELF_ABI)[number]["name"],
  args: readonly unknown[],
): TransactionAction => ({
  to: SAFE,
  data: encodeFunctionData({
    abi: SAFE_SELF_ABI,
    functionName,
    args,
  } as never),
});
const transfer: TransactionAction = { to: OTHER, value: 1n };

const signableOf = (tx: SafeTx) => {
  const signable = transactionSignable(1, SAFE, tx);
  expectKind(signable, "transaction");
  return signable;
};
const state: SafeState = {
  owners: [A, B],
  threshold: 2n,
  guard: zeroAddress,
  "module-guard": TOKEN,
  "fallback-handler": D.fallbackHandler,
};
const assess = (tx: SafeTx, withState: typeof state | null = state) =>
  assessSafeTx(
    SAFE,
    tx,
    decodeSafeTxCalls(signableOf(tx)),
    D,
    withState ?? undefined,
  );
const checks = (tx: SafeTx) => assess(tx).map((f) => f.check);
const txOf = (actions: TransactionAction[], extra: Partial<SafeTx> = {}) => ({
  ...buildSafeTx(actions, 0n, D),
  ...extra,
});
const blocked = (tx: SafeTx, allow: AllowOpts = {}) =>
  blockedBy(assess(tx), allow).map((f) => f.check);

describe("Safe > utils > assess", () => {
  it("finds nothing in a plain transfer or a call-only batch", () => {
    expect(assess(txOf([transfer]))).to.eql([]);
    expect(assess(txOf([transfer, transfer]))).to.eql([]);
  });

  it("lifts an untrusted delegatecall only for the listed target", () => {
    const tx = txOf([{ to: OTHER, data: "0x", operation: 1 }]);
    expect(assess(tx)[0]).to.deep.include({
      check: "delegatecall",
      allow: "allow-delegate-call-to",
      values: [OTHER],
      path: "calls[0]",
    });
    expect(blocked(tx, { "allow-delegate-call-to": [TOKEN] })).to.eql([
      "delegatecall",
    ]);
    // Addresses match whatever their case; extra ones do no harm.
    expect(
      blocked(tx, { "allow-delegate-call-to": [TOKEN, OTHER.toUpperCase()] }),
    ).to.eql([]);
    expect(blocked(tx, { "allow-delegate-call-to": OTHER })).to.eql([]);
  });

  it("trusts MultiSendCallOnly, SignMessageLib and the fixed-target SafeMigration", () => {
    for (const to of [D.multiSendCallOnly, D.signMessageLib])
      expect(checks(txOf([{ to, data: "0x", operation: 1 }]))).to.eql([]);
    const [migration] = assess(
      txOf([
        {
          to: D.migration,
          data: toFunctionSelector("migrateL2WithFallbackHandler()"),
          operation: 1,
        },
      ]),
    );
    expect(migration.severity).to.equal("notice");
    expect(migration.message).to.include(D.l2Singleton);
    expect(migration.message).to.include(D.fallbackHandler);
  });

  it("trusts MultiSend only as far as its inner delegatecalls", () => {
    const tx = txOf([transfer, { to: OTHER, data: "0x", operation: 1 }]);
    expect(tx.to).to.equal(D.multiSend);
    const [finding] = assess(tx);
    expect(finding.check).to.equal("delegatecall");
    expect(finding.path).to.equal("calls[0].calls[1]");
    // Undecodable MultiSend calldata hides what it runs as the Safe.
    expect(blocked({ ...tx, data: "0xdeadbeef" })).to.eql(["delegatecall"]);
  });

  it("judges owner changes by their net effect on the current owners", () => {
    // Adding C at the current threshold only needs C.
    const add = txOf([self("addOwnerWithThreshold", [C, 2n])]);
    expect(blocked(add)).to.eql(["new-owners"]);
    expect(blocked(add, { "allow-new-owners": [C] })).to.eql([]);
    expect(blocked(add, { "allow-new-owners": [OTHER] })).to.eql([
      "new-owners",
    ]);

    // A swap is one owner in, one out; the threshold stays.
    const swap = txOf([self("swapOwner", [SENTINEL, B, C])]);
    expect(assess(swap).map((f) => [f.check, f.values])).to.eql([
      ["new-owners", [C]],
      ["removed-owners", [B]],
    ]);

    // A threshold change names the resulting threshold.
    const threshold = txOf([self("changeThreshold", [1n])]);
    expect(assess(threshold)[0].message).to.include("from 2 to 1");
    expect(blocked(threshold, { "allow-change-threshold-to": 2 })).to.eql([
      "threshold",
    ]);
    expect(blocked(threshold, { "allow-change-threshold-to": 1 })).to.eql([]);

    // Re-setting the current threshold, or adding and removing the same
    // owner, changes nothing.
    expect(blocked(txOf([self("changeThreshold", [2n])]))).to.eql([]);
    expect(
      blocked(
        txOf([
          self("addOwnerWithThreshold", [C, 2n]),
          self("removeOwner", [SENTINEL, C, 2n]),
        ]),
      ),
    ).to.eql([]);
  });

  it("falls back to each call's arguments without chain state", () => {
    const tx = txOf([self("addOwnerWithThreshold", [C, 2n])]);
    expect(assess(tx, null).map((f) => [f.check, f.values])).to.eql([
      ["new-owners", [C]],
      ["threshold", ["2"]],
    ]);
  });

  it("binds modules to their addresses", () => {
    const tx = txOf([
      transfer,
      self("enableModule", [C]),
      self("disableModule", [SENTINEL, A]),
    ]);
    expect(assess(tx).map((f) => [f.check, f.severity, f.path])).to.eql([
      ["new-module", "block", "calls[0].calls[1]"],
      ["disable-module", "notice", "calls[0].calls[2]"],
    ]);
    expect(blocked(tx, { "allow-new-modules": C })).to.eql([]);
  });

  it("judges each guard and the fallback handler by the value it ends at", () => {
    const tx = txOf([
      self("setGuard", [OTHER]),
      self("setModuleGuard", [zeroAddress]),
      self("setFallbackHandler", [C]),
    ]);
    const findings = assess(tx);
    expect(findings.map((f) => [f.check, f.values])).to.eql([
      ["guard", [OTHER]],
      ["module-guard", [zeroAddress]],
      ["fallback-handler", [C]],
    ]);
    expect(findings[1].message).to.equal(
      `removes the module guard (was ${TOKEN})`,
    );
    // One slot's allowance says nothing about the other's.
    expect(blocked(tx, { "allow-guard-to": OTHER })).to.eql([
      "module-guard",
      "fallback-handler",
    ]);
    expect(
      blocked(tx, {
        "allow-guard-to": OTHER,
        "allow-module-guard-to": "none",
        "allow-fallback-handler-to": C,
      }),
    ).to.eql([]);
    expect(requiredOptions(blockedBy(findings))).to.eql([
      `--allow-guard-to ${OTHER}`,
      "--allow-module-guard-to none",
      `--allow-fallback-handler-to ${C}`,
    ]);
  });

  it("ignores settings a transaction leaves as they were", () => {
    expect(
      assess(
        txOf([
          self("setGuard", [OTHER]),
          self("setGuard", [zeroAddress]),
          self("setModuleGuard", [TOKEN]),
          self("setFallbackHandler", [D.fallbackHandler]),
        ]),
      ),
    ).to.eql([]);
    // SafeMigration sets the deployment's own handler.
    expect(
      checks(
        txOf([
          transfer,
          {
            to: D.migration,
            data: toFunctionSelector("migrateWithFallbackHandler()"),
            operation: 1,
          },
        ]),
      ),
    ).to.eql(["migration"]);
  });

  it("decodes the Safe's own management calls and names plain transfers", () => {
    const [call] = decodeSafeTxCalls(
      signableOf(txOf([self("changeThreshold", [1n])])),
    );
    expect(call.decoded).to.deep.include({
      status: "decoded",
      source: "safe",
      signature: "changeThreshold(uint256)",
    });
    const label = (a: TransactionAction) =>
      decodeSafeTxCalls(signableOf(txOf([a])))[0].decoded.label;
    expect(label({ to: SAFE })).to.equal("rejection");
    expect(label({ to: SAFE, value: 1n })).to.equal("self-transfer");
    expect(label({ to: OTHER })).to.equal("zero-value-transfer");
    expect(label(transfer)).to.equal("transfer");
  });

  it("blocks any gas refund behind a plain flag", () => {
    const refund = (extra: Partial<SafeTx>) => txOf([transfer], extra);
    expect(blocked(refund({ gasPrice: 5n }))).to.eql(["gas-refund"]);
    const both = assess(refund({ gasToken: TOKEN, refundReceiver: OTHER }));
    expect(both.length).to.equal(1);
    expect(both[0].message).to.include("hiding a transfer");
    expect(
      blocked(refund({ gasToken: TOKEN }), { "allow-gas-refund": true }),
    ).to.eql([]);
  });

  it("blocks competing transactions, except for a rejection", () => {
    const tx = txOf([transfer]);
    expect(assessCompeting(SAFE, tx, [])).to.eql([]);
    expect(assessCompeting(SAFE, tx, ["0xaa"])[0].allow).to.equal(
      "allow-competing",
    );
    expect(
      assessCompeting(SAFE, txOf([{ to: SAFE }]), ["0xaa"])[0].severity,
    ).to.equal("notice");
    expect(assessCompeting(SAFE, tx, undefined)[0].severity).to.equal("notice");
  });

  it("refuses a consumed nonce with no way around it", () => {
    const [finding] = assessReviewState({
      readiness: "nonce-consumed",
      chain: { nonce: "3" },
      signatures: [],
    });
    expect(finding.allow).to.equal(undefined);
    expect(() =>
      enforceFindings([finding], { "allow-competing": true }, "safe:confirm"),
    ).to.throw("can never execute");
  });

  it("prints the exact options that lift every blocking finding", () => {
    const tx = txOf(
      [
        self("addOwnerWithThreshold", [C, 3n]),
        { to: OTHER, data: "0x", operation: 1 },
      ],
      { gasPrice: 1n },
    );
    const options = requiredOptions(blockedBy(assess(tx)));
    expect(options).to.eql([
      `--allow-delegate-call-to ${OTHER}`,
      `--allow-new-owners ${C}`,
      "--allow-change-threshold-to 3",
      "--allow-gas-refund true",
    ]);
    expect(() => enforceFindings(assess(tx), {}, "safe:confirm")).to.throw(
      `if intended, pass ${options.join(" ")}`,
    );
    expect(() =>
      enforceFindings(
        assess(tx),
        {
          "allow-delegate-call-to": [OTHER],
          "allow-new-owners": [C],
          "allow-change-threshold-to": 3n,
          "allow-gas-refund": true,
        },
        "safe:confirm",
      ),
    ).not.to.throw();
  });

  it("reports findings from @safe:verify's review", async () => {
    const report = await reviewSafeSignable(
      signableOf(txOf([self("changeThreshold", [1n])])),
    );
    expect(report.findings.map((f) => f.check)).to.eql(["threshold"]);
  });
});
