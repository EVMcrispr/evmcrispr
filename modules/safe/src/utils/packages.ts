import {
  BindingsSpace,
  decodeLocalCall,
  ErrorException,
  type Module,
} from "@evmcrispr/sdk";
import {
  type Abi,
  type Address,
  concatHex,
  decodeFunctionData,
  getAddress,
  type Hex,
  hashDomain,
  hashStruct,
  hashTypedData,
  isAddress,
  keccak256,
  type PublicClient,
  padHex,
  parseAbi,
  recoverAddress,
  size,
  sliceHex,
  type TypedDataDefinition,
  toHex,
} from "viem";
import { safeDeployment } from "../addresses";
import {
  collectSafeTxWarnings,
  getSafeMessageHashes,
  getSafeTxHashes,
  SAFE_MESSAGE_TYPE,
} from "./hashes";
import {
  exportSafeTransaction,
  importSafeTransaction,
  normalizeSafeSignature,
  safeUint,
  stringifySafeTransaction,
} from "./offline";
import {
  assertSafeVersion,
  getOwners,
  getSafeNonce,
  getThreshold,
} from "./reads";
import {
  getSafeDomain,
  getSafeTxTypedData,
  preValidatedSignature,
  SAFE_DOMAIN_TYPE,
  type SafeTx,
} from "./safeTx";

export type PackageSignature =
  | Hex
  | { type: "contract"; owner: Address; signature: Hex };
interface PackageBase {
  version: 1;
  chainId: number;
  safe: Address;
  signatures: PackageSignature[];
}
export type SafePackage = PackageBase &
  (
    | { kind: "transaction"; tx: SafeTx; safeTxHash: Hex }
    | { kind: "message"; message: Hex; safeMessageHash: Hex }
  );
export function bindSafeOutput(
  module: Module,
  name: string | undefined,
  value: unknown,
) {
  if (name)
    module.bindingsManager.setBinding(
      name,
      typeof value === "string" ? value : stringifySafeTransaction(value),
      BindingsSpace.USER,
      true,
      undefined,
      true,
    );
}
function bytes(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x(?:[a-fA-F0-9]{2})*$/.test(value))
    throw new ErrorException("expected hex-encoded bytes");
  return value.toLowerCase() as Hex;
}
function signature(input: unknown): PackageSignature {
  if (typeof input === "string")
    return normalizeSafeSignature(input).toLowerCase() as Hex;
  const s = input as any;
  if (
    s?.type !== "contract" ||
    typeof s.owner !== "string" ||
    !isAddress(s.owner)
  )
    throw new ErrorException(
      "expected an EOA signature or {type: contract, owner, signature}",
    );
  return {
    type: "contract",
    owner: getAddress(s.owner),
    signature: bytes(s.signature),
  };
}
export function transactionPackage(
  chainId: number,
  safe: Address,
  tx: SafeTx,
  signatures: PackageSignature[] = [],
): SafePackage {
  return {
    ...JSON.parse(exportSafeTransaction(chainId, safe, tx, [])),
    tx,
    signatures,
  };
}
export function packageTypedData(pkg: SafePackage): TypedDataDefinition {
  if (pkg.kind === "transaction")
    return getSafeTxTypedData(pkg.chainId, pkg.safe, pkg.tx);
  return {
    domain: getSafeDomain(pkg.chainId, pkg.safe),
    types: { EIP712Domain: SAFE_DOMAIN_TYPE, SafeMessage: SAFE_MESSAGE_TYPE },
    primaryType: "SafeMessage",
    message: { message: pkg.message },
  } as const;
}
export function packageHashes(pkg: SafePackage) {
  if (pkg.kind === "transaction") {
    const h = getSafeTxHashes(pkg.chainId, pkg.safe, pkg.tx);
    return { ...h, finalHash: h.safeTxHash };
  }
  const typed = packageTypedData(pkg);
  const domainHash = hashDomain({ domain: typed.domain!, types: typed.types });
  const messageHash = hashStruct({
    data: typed.message,
    primaryType: typed.primaryType,
    types: typed.types,
  });
  const finalHash = keccak256(concatHex(["0x1901", domainHash, messageHash]));
  return { domainHash, messageHash, finalHash, safeMessageHash: finalHash };
}
export function signingBytes(pkg: SafePackage): Hex {
  const h = packageHashes(pkg);
  return concatHex(["0x1901", h.domainHash, h.messageHash]);
}
export function messagePackage(
  chainId: number,
  safe: Address,
  message: string,
  format = "auto",
): SafePackage {
  const raw =
    format === "bytes"
      ? bytes(message)
      : format === "auto"
        ? getSafeMessageHashes(chainId, safe, message).innerHash
        : (() => {
            throw new ErrorException("--format must be auto or bytes");
          })();
  const pkg: SafePackage = {
    version: 1,
    kind: "message",
    chainId,
    safe: getAddress(safe),
    message: raw,
    signatures: [],
    safeMessageHash: "0x",
  };
  pkg.safeMessageHash = hashTypedData(packageTypedData(pkg));
  return pkg;
}
export function parseSafePackage(
  input: string | unknown,
  chainId?: number,
  safe?: Address,
): SafePackage {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new ErrorException(
        "expected an exported Safe package; a hash or nonce cannot recover transaction data without the service",
      );
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new ErrorException("expected a Safe package object");
  const p = raw as any;
  if (p.version !== undefined && p.version !== 1)
    throw new ErrorException("unsupported Safe package version");
  const id = safeUint(p.chainId, "chainId");
  if (id > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ErrorException("chainId exceeds safe integer range");
  if (!isAddress(p.safe))
    throw new ErrorException("invalid package Safe address");
  if (chainId !== undefined && id !== BigInt(chainId))
    throw new ErrorException(
      "Safe package chainId does not match the connected chain",
    );
  if (safe && safe.toLowerCase() !== p.safe.toLowerCase())
    throw new ErrorException(
      `Safe package belongs to Safe ${p.safe}, not ${safe}`,
    );
  if (!Array.isArray(p.signatures))
    throw new ErrorException("package signatures must be an array");
  const signatures = p.signatures.map(signature);
  if (p.kind === "message") {
    const pkg = messagePackage(Number(id), p.safe, p.message, "bytes");
    if (p.safeMessageHash?.toLowerCase() !== packageHashes(pkg).finalHash)
      throw new ErrorException("safeMessageHash mismatch");
    return { ...pkg, signatures };
  }
  const { tx } = importSafeTransaction(
    stringifySafeTransaction({ ...p, signatures: [] }),
    Number(id),
    p.safe,
  );
  return transactionPackage(Number(id), getAddress(p.safe), tx, signatures);
}
export async function packageSigners(pkg: SafePackage) {
  const hash = packageHashes(pkg).finalHash;
  const seen = new Map<
    string,
    { owner: Address; signature: PackageSignature }
  >();
  for (const input of pkg.signatures) {
    const s = signature(input);
    const owner =
      typeof s === "string"
        ? await recoverAddress({ hash, signature: s })
        : s.owner;
    const key = owner.toLowerCase();
    const old = seen.get(key);
    if (
      old &&
      stringifySafeTransaction(old.signature) !== stringifySafeTransaction(s)
    )
      throw new ErrorException(
        `conflicting signatures for Safe owner ${owner}`,
      );
    seen.set(key, { owner, signature: s });
  }
  return [...seen.values()].sort((a, b) =>
    a.owner.toLowerCase().localeCompare(b.owner.toLowerCase()),
  );
}
/** All static slots precede contract tails. Offsets are relative to the signature blob. */
export function packPackageSigners(
  signers: {
    owner: Address;
    signature: PackageSignature | { type: "approved" };
  }[],
): Hex {
  const sorted = [...signers].sort((a, b) =>
    a.owner.toLowerCase().localeCompare(b.owner.toLowerCase()),
  );
  const heads: Hex[] = [],
    tails: Hex[] = [];
  let offset = sorted.length * 65;
  for (const { owner, signature: s } of sorted) {
    if (typeof s === "string") heads.push(s);
    else if (s.type === "approved") heads.push(preValidatedSignature(owner));
    else {
      heads.push(
        concatHex([
          padHex(owner, { size: 32 }),
          toHex(offset, { size: 32 }),
          "0x00",
        ]),
      );
      const tail = concatHex([
        toHex(size(s.signature), { size: 32 }),
        s.signature,
      ]);
      tails.push(tail);
      offset += size(tail);
    }
  }
  return concatHex([...heads, ...tails]);
}
export async function mergeSafePackages(
  base: string | SafePackage,
  additions: unknown[],
): Promise<SafePackage> {
  const pkg = parseSafePackage(base);
  for (let input of additions) {
    if (typeof input === "string" && input.trim().startsWith("{"))
      input = JSON.parse(input);
    if (input && typeof input === "object" && "chainId" in input) {
      const other = parseSafePackage(input);
      if (other.chainId !== pkg.chainId)
        throw new ErrorException("cannot merge packages from different chains");
      if (
        other.safe.toLowerCase() === pkg.safe.toLowerCase() &&
        other.kind === pkg.kind &&
        packageHashes(other).finalHash === packageHashes(pkg).finalHash
      )
        pkg.signatures.push(...other.signatures);
      else if (
        other.kind === "message" &&
        other.safe.toLowerCase() !== pkg.safe.toLowerCase() &&
        other.message === signingBytes(pkg)
      ) {
        pkg.signatures.push({
          type: "contract",
          owner: other.safe,
          signature: packPackageSigners(await packageSigners(other)),
        });
      } else
        throw new ErrorException(
          "cannot merge packages with different signed payloads",
        );
    } else pkg.signatures.push(signature(input));
  }
  pkg.signatures = (await packageSigners(pkg)).map((s) => s.signature);
  return pkg;
}
const validationAbi = parseAbi([
  "function approvedHashes(address,bytes32) view returns (uint256)",
  "function isValidSignature(bytes,bytes) view returns (bytes4)",
]);
export async function reviewSafePackage(
  input: SafePackage | string,
  client?: PublicClient,
  abis: Record<string, Abi> = {},
) {
  const pkg = parseSafePackage(input);
  const hashes = packageHashes(pkg);
  const signers = await packageSigners(pkg);
  const checks = signers.map((s) => ({
    owner: s.owner,
    type: typeof s.signature === "string" ? "eoa" : "contract",
    status: typeof s.signature === "string" ? "recovered" : "unchecked",
  }));
  let chain: {
    status: string;
    owners?: Address[];
    threshold?: string;
    nonce?: string;
    version?: string;
  } = { status: "unchecked" };
  let ready = false;
  let readiness = "unchecked";
  let packedSignatures = packPackageSigners(signers);
  if (client) {
    const version = await assertSafeVersion(client, pkg.safe);
    const [owners, threshold, nonce] = await Promise.all([
      getOwners(client, pkg.safe),
      getThreshold(client, pkg.safe),
      pkg.kind === "transaction" ? getSafeNonce(client, pkg.safe) : undefined,
    ]);
    chain = {
      status: "verified",
      version,
      owners,
      threshold: String(threshold),
      nonce: nonce?.toString(),
    };
    for (const [i, s] of signers.entries()) {
      if (!owners.some((o) => o.toLowerCase() === s.owner.toLowerCase()))
        checks[i].status = "not-owner";
      else if (typeof s.signature === "string") checks[i].status = "valid";
      else {
        try {
          const magic = await client.readContract({
            address: s.owner,
            account: pkg.safe,
            abi: validationAbi,
            functionName: "isValidSignature",
            args: [signingBytes(pkg), s.signature.signature],
          });
          checks[i].status = magic === "0x20c13b0b" ? "valid" : "invalid";
        } catch {
          checks[i].status = "invalid";
        }
      }
    }
    const usable: Parameters<typeof packPackageSigners>[0] = signers.filter(
      (_, i) => checks[i].status === "valid",
    );
    for (const owner of owners) {
      if (usable.some((s) => s.owner.toLowerCase() === owner.toLowerCase()))
        continue;
      const approved = await client.readContract({
        address: pkg.safe,
        abi: validationAbi,
        functionName: "approvedHashes",
        args: [owner, hashes.finalHash],
      });
      if (approved > 0n) {
        usable.push({ owner, signature: { type: "approved" } });
        checks.push({ owner, type: "approved", status: "valid" });
      }
    }
    const invalid = checks.some(
      (s) => s.status === "invalid" || s.status === "not-owner",
    );
    readiness = invalid
      ? "invalid-signatures"
      : pkg.kind === "transaction" && nonce !== pkg.tx.nonce
        ? nonce! > pkg.tx.nonce
          ? "nonce-consumed"
          : "future-nonce"
        : BigInt(usable.length) < threshold
          ? "insufficient-signatures"
          : "ready";
    ready = readiness === "ready";
    packedSignatures = packPackageSigners(usable.slice(0, Number(threshold)));
  }
  const decodedCalls: unknown[] = [];
  function decodeCall(
    to: Address,
    value: bigint,
    data: Hex,
    operation: number,
    depth = 0,
  ): unknown {
    const abi = Object.entries(abis).find(
      ([a]) => a.toLowerCase() === to.toLowerCase(),
    )?.[1];
    let decoded: unknown = {
      status: data === "0x" ? "transfer" : "unverified",
    };
    if (abi) {
      try {
        decoded = {
          status: "decoded",
          source: "supplied-abi",
          ...decodeLocalCall(abi, data),
        };
      } catch (e) {
        decoded = { status: "unverified", reason: (e as Error).message };
      }
    }
    const deployment = safeDeployment(pkg.chainId);
    if (
      depth < 8 &&
      operation === 1 &&
      [deployment.multiSend, deployment.multiSendCallOnly].some(
        (a) => a.toLowerCase() === to.toLowerCase(),
      )
    ) {
      try {
        const {
          args: [packed],
        } = decodeFunctionData({
          abi: parseAbi(["function multiSend(bytes transactions)"]),
          data,
        });
        const calls: unknown[] = [];
        let offset = 0;
        while (offset < size(packed)) {
          if (size(packed) - offset < 85)
            throw new Error("truncated MultiSend entry");
          const op = Number(BigInt(sliceHex(packed, offset, offset + 1)));
          const target = getAddress(sliceHex(packed, offset + 1, offset + 21));
          const amount = BigInt(sliceHex(packed, offset + 21, offset + 53));
          const length = BigInt(sliceHex(packed, offset + 53, offset + 85));
          if (op > 1 || length > BigInt(size(packed) - offset - 85))
            throw new Error("invalid MultiSend entry");
          calls.push(
            decodeCall(
              target,
              amount,
              sliceHex(packed, offset + 85, offset + 85 + Number(length)),
              op,
              depth + 1,
            ),
          );
          offset += 85 + Number(length);
        }
        decoded = { status: "decoded", signature: "multiSend(bytes)", calls };
      } catch (e) {
        decoded = { status: "unverified", reason: (e as Error).message };
      }
    }
    return { to, value, data, operation, decoded };
  }
  if (pkg.kind === "transaction")
    decodedCalls.push(
      decodeCall(pkg.tx.to, pkg.tx.value, pkg.tx.data, pkg.tx.operation),
    );
  return {
    package: pkg,
    typedData: packageTypedData(pkg),
    signingBytes: signingBytes(pkg),
    hashes,
    decodedCalls,
    signatures: checks,
    packedSignatures,
    chain,
    ready,
    readiness,
    warnings:
      pkg.kind === "transaction"
        ? collectSafeTxWarnings(pkg.tx, safeDeployment(pkg.chainId))
        : [],
  };
}
