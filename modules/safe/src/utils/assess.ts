import type { Address, OptDef } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import {
  decodeFunctionData,
  getAddress,
  type Hex,
  isAddressEqual,
  parseAbi,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import type { SafeDeployment } from "../addresses";
import type { SafeTx } from "./safeTx";

/** A call of a Safe transaction as the review decodes it: the transaction
 *  itself, and the calls of a MultiSend it delegatecalls. */
export interface DecodedCall {
  to: Address;
  value: bigint;
  data: Hex;
  operation: number;
  decoded: {
    status: string;
    label?: string;
    signature?: string;
    calls?: DecodedCall[];
    [key: string]: unknown;
  };
}

export type AllowFlag =
  | "allow-delegate-call-to"
  | "allow-new-owners"
  | "allow-removed-owners"
  | "allow-change-threshold-to"
  | "allow-new-modules"
  | "allow-guard-to"
  | "allow-module-guard-to"
  | "allow-fallback-handler-to"
  | "allow-gas-refund"
  | "allow-competing";

/**
 * What lets a gated command go ahead despite a blocking finding, spread
 * into the `opts` of each gated command. Anything that hands power to an
 * address names the addresses (or the threshold) that were reviewed, so a
 * transaction changed after the review is still refused; the rest are
 * plain flags. Literal, so the docs generator can read it.
 */
export const ALLOW_OPTS = [
  {
    name: "allow-delegate-call-to",
    type: ["address", "array"],
    description:
      "Contracts the transaction may delegatecall besides MultiSendCallOnly, SafeMigration and SignMessageLib",
  },
  {
    name: "allow-new-owners",
    type: ["address", "array"],
    description: "Owners the transaction may add",
  },
  {
    name: "allow-removed-owners",
    type: ["address", "array"],
    description: "Owners the transaction may remove",
  },
  {
    name: "allow-change-threshold-to",
    type: "number",
    description: "Threshold the transaction may leave the Safe with",
  },
  {
    name: "allow-new-modules",
    type: ["address", "array"],
    description: "Modules the transaction may enable",
  },
  {
    name: "allow-guard-to",
    type: ["address", "string"],
    description:
      "Transaction guard the transaction may leave the Safe with (none removes it)",
  },
  {
    name: "allow-module-guard-to",
    type: ["address", "string"],
    description:
      "Module guard the transaction may leave the Safe with (none removes it)",
  },
  {
    name: "allow-fallback-handler-to",
    type: ["address", "string"],
    description:
      "Fallback handler the transaction may leave the Safe with (none removes it)",
  },
  {
    name: "allow-gas-refund",
    type: "bool",
    description:
      "Sign or execute despite a gas refund (gasPrice, gasToken or refundReceiver set)",
  },
  {
    name: "allow-competing",
    type: "bool",
    description:
      "Sign or execute although other transactions are queued at the same nonce",
  },
] satisfies (OptDef & { name: AllowFlag })[];

/** The allow options as a command receives them. */
export type AllowOpts = Partial<Record<AllowFlag, unknown>>;

/** How an option names what it allows: addresses, one address or `none`,
 *  a threshold, or nothing. */
const kindOf = (flag: AllowFlag): "list" | "slot" | "number" | "bool" => {
  const { type } = ALLOW_OPTS.find((o) => o.name === flag)!;
  if (Array.isArray(type)) return type.includes("array") ? "list" : "slot";
  return type === "number" ? "number" : "bool";
};

export interface SafeFinding {
  check:
    | "delegatecall"
    | "new-owners"
    | "removed-owners"
    | "threshold"
    | "new-module"
    | "guard"
    | "module-guard"
    | "fallback-handler"
    | "migration"
    | "disable-module"
    | "gas-refund"
    | "competing"
    | "nonce-consumed"
    | "future-nonce"
    | "unverified-call"
    | "signature";
  /** A blocking finding stops a gated command unless `allow` lifts it; one
   *  without `allow` cannot be overridden. */
  severity: "block" | "notice";
  allow?: AllowFlag;
  /** The addresses or threshold `allow` must name. */
  values?: string[];
  /** Where in `decodedCalls` it was found, e.g. `calls[0].calls[2]`. */
  path?: string;
  message: string;
}

/** The management functions a Safe calls on itself, for local decoding. */
export const SAFE_SELF_ABI = parseAbi([
  "function addOwnerWithThreshold(address owner, uint256 _threshold)",
  "function removeOwner(address prevOwner, address owner, uint256 _threshold)",
  "function swapOwner(address prevOwner, address oldOwner, address newOwner)",
  "function changeThreshold(uint256 _threshold)",
  "function enableModule(address module)",
  "function disableModule(address prevModule, address module)",
  "function setGuard(address guard)",
  "function setModuleGuard(address moduleGuard)",
  "function setFallbackHandler(address handler)",
  "function approveHash(bytes32 hashToApprove)",
]);

const SELF_SELECTORS = new Set(SAFE_SELF_ABI.map((f) => toFunctionSelector(f)));

const selfCall = (data: Hex) => {
  if (!SELF_SELECTORS.has(data.slice(0, 10).toLowerCase() as Hex)) return;
  try {
    return decodeFunctionData({ abi: SAFE_SELF_ABI, data });
  } catch {
    return;
  }
};

const isRejection = (safe: Address, tx: SafeTx) =>
  isAddressEqual(tx.to, safe) &&
  tx.value === 0n &&
  tx.data === "0x" &&
  tx.operation === 0;

/** What a call without calldata does, as safe-tx-hashes-util names it. */
export function transferLabel(
  safe: Address,
  to: Address,
  value: bigint,
  top: boolean,
): string {
  if (isAddressEqual(to, safe))
    return value === 0n ? (top ? "rejection" : "no-op") : "self-transfer";
  return value === 0n ? "zero-value-transfer" : "transfer";
}

/** The single-address settings of a Safe: each call overwrites the last,
 *  and the zero address clears it. */
const SLOTS = {
  guard: {
    allow: "allow-guard-to",
    label: "transaction guard",
    risk: "which can block every owner transaction",
  },
  "module-guard": {
    allow: "allow-module-guard-to",
    label: "module guard",
    risk: "which can block every module transaction",
  },
  "fallback-handler": {
    allow: "allow-fallback-handler-to",
    label: "fallback handler",
    risk: "which answers calls the Safe does not implement, including signature checks",
  },
} as const;
type Slot = keyof typeof SLOTS;

/** What `assessSafeTx` compares the transaction's effects with. */
export interface SafeState {
  owners: Address[];
  threshold: bigint;
  guard: Address;
  "module-guard": Address;
  "fallback-handler": Address;
}

const includes = (list: Address[], a: Address) =>
  list.some((b) => isAddressEqual(a, b));
const sameSet = (a: Address[], b: Address[]) =>
  a.length === b.length && a.every((x) => includes(b, x));

/**
 * Checks of a Safe transaction's content, ported from
 * pcaversaccio/safe-tx-hashes-util and extended to modules, guards and the
 * fallback handler. Walks every call a MultiSend makes. With the Safe's
 * current state, owners, threshold, guards and fallback handler are judged
 * by what the transaction leaves them as; without it, by each call.
 */
export function assessSafeTx(
  safe: Address,
  tx: SafeTx,
  decodedCalls: DecodedCall[],
  deployment: SafeDeployment,
  state?: SafeState,
): SafeFinding[] {
  const findings: SafeFinding[] = [];
  const trusted = [
    deployment.multiSendCallOnly,
    deployment.migration,
    deployment.signMessageLib,
  ];
  let owners = state ? [...state.owners] : [];
  let threshold = state?.threshold;
  const added: Address[] = [];
  const removed: Address[] = [];
  const ownerPaths: string[] = [];
  let thresholdSet = false;
  const slots: Partial<
    Record<Slot, { value: Address; paths: string[]; migration: boolean }>
  > = {};
  const setSlot = (
    slot: Slot,
    value: Address,
    path: string,
    migration = false,
  ) => {
    slots[slot] = {
      value,
      paths: [...(slots[slot]?.paths ?? []), path],
      migration,
    };
  };

  const walk = (call: DecodedCall, path: string) => {
    if (call.operation === 1) {
      const multiSend =
        isAddressEqual(call.to, deployment.multiSend) &&
        call.decoded.status === "decoded";
      if (!multiSend && !includes(trusted, call.to))
        findings.push({
          check: "delegatecall",
          severity: "block",
          allow: "allow-delegate-call-to",
          values: [call.to],
          path,
          message: `DELEGATECALL to ${call.to}, which is not MultiSendCallOnly, SafeMigration or SignMessageLib: a delegatecall runs its code as the Safe and can take it over`,
        });
      if (isAddressEqual(call.to, deployment.migration)) {
        // SafeMigration's targets are immutables of the trusted deployment.
        const l2 = call.decoded.signature?.startsWith("migrateL2");
        const handler = call.decoded.signature?.includes("FallbackHandler");
        if (handler)
          setSlot("fallback-handler", deployment.fallbackHandler, path, true);
        findings.push({
          check: "migration",
          severity: "notice",
          path,
          message: `upgrades the Safe to the v1.5.0 ${l2 ? "L2 " : ""}singleton ${l2 ? deployment.l2Singleton : deployment.singleton}${handler ? ` and sets the fallback handler to ${deployment.fallbackHandler}` : ""}`,
        });
      }
    } else if (isAddressEqual(call.to, safe)) {
      const self = selfCall(call.data);
      switch (self?.functionName) {
        case "addOwnerWithThreshold":
          added.push(self.args[0]);
          owners.push(self.args[0]);
          threshold = self.args[1];
          thresholdSet = true;
          ownerPaths.push(path);
          break;
        case "removeOwner":
          removed.push(self.args[1]);
          owners = owners.filter((o) => !isAddressEqual(o, self.args[1]));
          threshold = self.args[2];
          thresholdSet = true;
          ownerPaths.push(path);
          break;
        case "swapOwner":
          removed.push(self.args[1]);
          added.push(self.args[2]);
          owners = [
            ...owners.filter((o) => !isAddressEqual(o, self.args[1])),
            self.args[2],
          ];
          ownerPaths.push(path);
          break;
        case "changeThreshold":
          threshold = self.args[0];
          thresholdSet = true;
          ownerPaths.push(path);
          break;
        case "enableModule":
          findings.push({
            check: "new-module",
            severity: "block",
            allow: "allow-new-modules",
            values: [self.args[0]],
            path,
            message: `enables module ${self.args[0]}, which can then move anything without owner signatures`,
          });
          break;
        case "disableModule":
          findings.push({
            check: "disable-module",
            severity: "notice",
            path,
            message: `disables module ${self.args[1]}`,
          });
          break;
        case "setGuard":
          setSlot("guard", self.args[0], path);
          break;
        case "setModuleGuard":
          setSlot("module-guard", self.args[0], path);
          break;
        case "setFallbackHandler":
          setSlot("fallback-handler", self.args[0], path);
          break;
      }
    }
    if (call.decoded.status === "unverified" && call.data !== "0x")
      findings.push({
        check: "unverified-call",
        severity: "notice",
        path,
        message: `calldata to ${call.to} was not decoded${call.decoded.reason ? ` (${call.decoded.reason})` : ""}; pass abi: to @safe:verify to check it`,
      });
    call.decoded.calls?.forEach((c, i) => {
      walk(c, `${path}.calls[${i}]`);
    });
  };
  decodedCalls.forEach((c, i) => {
    walk(c, `calls[${i}]`);
  });

  // Each slot ends at its last value; SafeMigration's handler is the
  // trusted deployment's own.
  for (const [slot, set] of Object.entries(slots) as [
    Slot,
    NonNullable<(typeof slots)[Slot]>,
  ][]) {
    const { allow, label, risk } = SLOTS[slot];
    const current = state?.[slot];
    if (set.migration || (current && isAddressEqual(current, set.value)))
      continue;
    const was =
      current && !isAddressEqual(current, zeroAddress)
        ? ` (was ${current})`
        : "";
    findings.push({
      check: slot,
      severity: "block",
      allow,
      values: [set.value],
      path: set.paths.join(", "),
      message: isAddressEqual(set.value, zeroAddress)
        ? `removes the ${label}${was}`
        : `sets the ${label} to ${set.value}${was}, ${risk}`,
    });
  }

  // Net effect: an owner added then removed again is no change.
  const newOwners = state
    ? owners.filter((o) => !includes(state.owners, o))
    : added;
  const goneOwners = state
    ? state.owners.filter((o) => !includes(owners, o))
    : removed;
  const path = ownerPaths.join(", ") || undefined;
  if (newOwners.length)
    findings.push({
      check: "new-owners",
      severity: "block",
      allow: "allow-new-owners",
      values: newOwners,
      path,
      message: `adds owner${newOwners.length > 1 ? "s" : ""} ${newOwners.join(", ")}`,
    });
  if (goneOwners.length)
    findings.push({
      check: "removed-owners",
      severity: "block",
      allow: "allow-removed-owners",
      values: goneOwners,
      path,
      message: `removes owner${goneOwners.length > 1 ? "s" : ""} ${goneOwners.join(", ")}`,
    });
  if (
    thresholdSet &&
    threshold !== undefined &&
    (!state || threshold !== state.threshold)
  )
    findings.push({
      check: "threshold",
      severity: "block",
      allow: "allow-change-threshold-to",
      values: [threshold.toString()],
      path,
      message: state
        ? `changes the threshold from ${state.threshold} to ${threshold} (of ${owners.length} owners)`
        : `sets the threshold to ${threshold}`,
    });
  else if (state && sameSet(owners, state.owners) && ownerPaths.length)
    findings.push({
      check: "threshold",
      severity: "notice",
      path,
      message: "calls owner management functions with no net effect",
    });

  const token = !isAddressEqual(tx.gasToken, zeroAddress);
  const receiver = !isAddressEqual(tx.refundReceiver, zeroAddress);
  const price = tx.gasPrice > 0n;
  if (token || receiver || price) {
    const parts = [
      token && `a custom gas token (${tx.gasToken})`,
      receiver && `a custom refund receiver (${tx.refundReceiver})`,
      price && `a non-zero gasPrice (${tx.gasPrice})`,
    ].filter(Boolean);
    findings.push({
      check: "gas-refund",
      severity: "block",
      allow: "allow-gas-refund",
      message: `pays a gas refund with ${parts.join(", ")}${token && receiver ? ": a known pattern for hiding a transfer of funds" : ""}`,
    });
  }
  return findings;
}

/** Checks of a review's chain state: nonce and signatures. */
export function assessReviewState(report: {
  readiness: string;
  chain: { nonce?: string };
  signatures: { owner: Address; status: string; reason?: string }[];
}): SafeFinding[] {
  const findings: SafeFinding[] = [];
  if (report.readiness === "nonce-consumed")
    findings.push({
      check: "nonce-consumed",
      severity: "block",
      message: `its nonce was already consumed (current on-chain nonce ${report.chain.nonce}): it can never execute`,
    });
  if (report.readiness === "future-nonce")
    findings.push({
      check: "future-nonce",
      severity: "notice",
      message: `its nonce is ahead of the on-chain nonce ${report.chain.nonce}: earlier transactions must execute first`,
    });
  for (const s of report.signatures)
    if (s.status === "invalid" || s.status === "not-owner")
      findings.push({
        check: "signature",
        severity: "notice",
        message: `the signature of ${s.owner} is ${s.status}${s.reason ? `: ${s.reason}` : ""}; it is not counted`,
      });
  return findings;
}

/** Other trusted transactions queued at the same nonce. A rejection exists
 *  to compete, so it is not blocked by what it replaces. `undefined` means
 *  the service could not be asked. */
export function assessCompeting(
  safe: Address,
  tx: SafeTx,
  competing: string[] | undefined,
): SafeFinding[] {
  if (competing === undefined)
    return [
      {
        check: "competing",
        severity: "notice",
        message: `could not check the Safe Transaction Service for other transactions queued at nonce ${tx.nonce}`,
      },
    ];
  if (competing.length === 0) return [];
  const list = competing.map((h) => `\n    ${h}`).join("");
  return [
    isRejection(safe, tx)
      ? {
          check: "competing",
          severity: "notice",
          message: `rejects ${competing.length} other transaction${competing.length === 1 ? "" : "s"} queued at nonce ${tx.nonce}:${list}`,
        }
      : {
          check: "competing",
          severity: "block",
          allow: "allow-competing",
          message: `${competing.length} other transaction${competing.length === 1 ? " is" : "s are"} queued at nonce ${tx.nonce}, and only one can execute:${list}`,
        },
  ];
}

/** The lowercase values an allow option names. */
const allowed = (allow: AllowOpts, flag: AllowFlag): Set<string> => {
  const raw = allow[flag];
  if (raw === undefined || raw === null) return new Set();
  const list = Array.isArray(raw) ? raw : [raw];
  return new Set(
    list.map((v) =>
      String(v).toLowerCase() === "none"
        ? zeroAddress
        : String(v).toLowerCase(),
    ),
  );
};

/** Whether `allow` lifts a blocking finding: a flag is set, or every
 *  address or threshold it names is listed. */
export const isAllowed = (f: SafeFinding, allow: AllowOpts = {}): boolean => {
  if (!f.allow) return false;
  if (kindOf(f.allow) === "bool") return allow[f.allow] === true;
  const set = allowed(allow, f.allow);
  return (f.values ?? []).every((v) => set.has(v.toLowerCase()));
};

export const blockedBy = (findings: SafeFinding[], allow: AllowOpts = {}) =>
  findings.filter((f) => f.severity === "block" && !isAllowed(f, allow));

/** The options that would lift `blocking`, ready to paste. */
export function requiredOptions(blocking: SafeFinding[]): string[] {
  const values = new Map<AllowFlag, string[]>();
  for (const f of blocking) {
    if (!f.allow) continue;
    const list = values.get(f.allow) ?? [];
    for (const v of f.values ?? [])
      if (!list.some((x) => x.toLowerCase() === v.toLowerCase()))
        list.push(
          kindOf(f.allow) === "number"
            ? v
            : isAddressEqual(v as Address, zeroAddress) &&
                kindOf(f.allow) === "slot"
              ? "none"
              : getAddress(v),
        );
    values.set(f.allow, list);
  }
  return [...values].map(([flag, list]) => {
    const kind = kindOf(flag);
    const value =
      kind === "bool"
        ? "true"
        : list.length === 1
          ? list[0]
          : `[${list.join(" ")}]`;
    return `--${flag} ${value}`;
  });
}

/** The lines findings add to the hashes log. Unless `enforced`, blocking
 *  findings are warnings: the transaction is being authored, not reviewed. */
export const formatFindings = (
  findings: SafeFinding[],
  allow: AllowOpts = {},
  enforced = true,
): string[] =>
  findings.map((f) => {
    const where = f.path ? `${f.path}: ` : "";
    if (f.severity === "notice") return `  ⓘ NOTICE: ${where}${f.message}`;
    if (!enforced) return `  ⚠️ WARNING: ${where}${f.message}`;
    if (isAllowed(f, allow))
      return `  ⚠️ ALLOWED (--${f.allow}): ${where}${f.message}`;
    return `  ⛔ BLOCKED: ${where}${f.message}`;
  });

/**
 * Refuse to sign or execute while a blocking finding is not explicitly
 * allowed. The error names every blocking finding and the options that
 * lift them, so one run shows everything to review.
 */
export function enforceFindings(
  findings: SafeFinding[],
  allow: AllowOpts,
  commandName: string,
): void {
  const blocking = blockedBy(findings, allow);
  if (blocking.length === 0) return;
  const lines = blocking.map(
    (f) => `- ${f.path ? `${f.path}: ` : ""}${f.message}`,
  );
  throw new ErrorException(
    `${commandName} refused:\n${lines.join("\n")}${
      blocking.every((f) => f.allow)
        ? `\nReview it with @safe:verify; if intended, pass ${requiredOptions(blocking).join(" ")}`
        : ""
    }`,
  );
}
