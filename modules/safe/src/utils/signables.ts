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
  hashMessage,
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
  getSafeTxHashes,
  looksLikeTypedData,
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

/** An owner Safe's approval of the item it is attached to (EIP-1271). Either
 *  the packed signature bytes, or — while the owner Safe's owners are still
 *  signing — the `message` it signs (see `nestedPayload`) and the signatures
 *  collected so far, packed once needed. */
export type ContractSignature =
  | { type: "contract"; owner: Address; signature: Hex }
  | {
      type: "contract";
      owner: Address;
      message: Hex;
      signatures: SafeSignature[];
    };
export type SafeSignature = Hex | ContractSignature;
export type CollectingSignature = Extract<
  ContractSignature,
  { signatures: SafeSignature[] }
>;
export const isCollecting = (s: SafeSignature): s is CollectingSignature =>
  typeof s !== "string" && "signatures" in s;
interface SignableBase {
  version: 1;
  chainId: number;
  safe: Address;
  signatures: SafeSignature[];
}
export type SafeSignable = SignableBase &
  (
    | { kind: "transaction"; tx: SafeTx; safeTxHash: Hex }
    | {
        kind: "message";
        message: Hex;
        safeMessageHash: Hex;
        /** The original text or EIP-712 typed data, when known. The Safe
         *  Transaction Service needs it; a nested-owner message over another
         *  Safe's signing bytes has none. */
        content?: SafeMessageContent;
      }
  );
/** A Safe message before hashing: EIP-191 text or EIP-712 typed data. */
export type SafeMessageContent = string | Record<string, unknown>;
/** The 32-byte message a Safe signs for `content`: EIP-191 for text,
 *  EIP-712 for typed data (the service encodes them the same way). */
export function messageContentHash(content: SafeMessageContent): Hex {
  if (typeof content === "string") return hashMessage(content);
  if (!looksLikeTypedData(content))
    throw new ErrorException(
      "typed-data message must be a JSON document with `types` and `message` fields",
    );
  return hashTypedData(content as any);
}
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
export function parseSafeSignature(input: unknown): SafeSignature {
  if (typeof input === "string")
    return normalizeSafeSignature(input).toLowerCase() as Hex;
  const s = input as any;
  if (
    s?.type !== "contract" ||
    typeof s.owner !== "string" ||
    !isAddress(s.owner)
  )
    throw new ErrorException(
      "expected an EOA signature, {type: contract, owner, signature} or {type: contract, owner, message, signatures}",
    );
  if (Array.isArray(s.signatures))
    return {
      type: "contract",
      owner: getAddress(s.owner),
      message: bytes(s.message),
      signatures: s.signatures.map(parseSafeSignature),
    };
  return {
    type: "contract",
    owner: getAddress(s.owner),
    signature: bytes(s.signature),
  };
}

/** Safe >=1.5.0 hands contract owners the 32-byte hash through
 *  isValidSignature(bytes32,bytes); older Safes hand them the whole preimage
 *  through the legacy isValidSignature(bytes,bytes). */
export const usesHashEip1271 = (version: string) => {
  const [major, minor] = version.split(".").map(Number);
  return major > 1 || (major === 1 && minor >= 5);
};
/** What an owner Safe signs to approve `signable` on a Safe at `version`:
 *  the `message` of the owner Safe's own SafeMessage. Safe >=1.5.0 passes
 *  the hash. Below that, transactions pass their EIP-712 preimage; messages
 *  pass their preimage on 1.4.x and their raw message on 1.3.x, whose
 *  fallback handler forwards it unencoded. */
export function nestedPayload(signable: SafeSignable, version: string): Hex {
  if (usesHashEip1271(version)) return signableHashes(signable).finalHash;
  if (signable.kind === "message" && version.startsWith("1.3."))
    return signable.message;
  return signingBytes(signable);
}
/** The owner Safe's SafeMessage a collecting contract signature signs. */
export const collectingSignable = (
  chainId: number,
  entry: CollectingSignature,
): SafeSignable => ({
  ...messageSignable(chainId, entry.owner, entry.message),
  signatures: entry.signatures,
});
/** Packed bytes of a contract signature, packing collected signatures. */
export async function packContractSignature(
  chainId: number,
  entry: ContractSignature,
): Promise<Hex> {
  if (!isCollecting(entry)) return entry.signature;
  const inner = collectingSignable(chainId, entry);
  return packSignableSigners(
    await packedSigners(chainId, await signableSigners(inner)),
  );
}
/** Signers with every collecting contract signature packed. */
export async function packedSigners(
  chainId: number,
  signers: { owner: Address; signature: SafeSignature }[],
) {
  return Promise.all(
    signers.map(async ({ owner, signature }) => ({
      owner,
      signature: isCollecting(signature)
        ? ({
            type: "contract",
            owner: signature.owner,
            signature: await packContractSignature(chainId, signature),
          } as const)
        : signature,
    })),
  );
}
/** One owner's signature slot as the Safe Transaction Service takes it: the
 *  65-byte EOA signature, or a contract signature's static part followed by
 *  its dynamic data. */
export async function serviceSignature(
  chainId: number,
  owner: Address,
  signature: SafeSignature,
): Promise<Hex> {
  if (typeof signature === "string") return signature;
  return packSignableSigners([
    {
      owner,
      signature: {
        type: "contract",
        owner,
        signature: await packContractSignature(chainId, signature),
      },
    },
  ]);
}
/** A contract signature as the service stores it (static part + dynamic
 *  data), or undefined for any other signature type. */
export function parseContractSignatureBlob(
  blob: Hex,
): SafeSignature | undefined {
  if (size(blob) < 65 + 32 || Number(BigInt(sliceHex(blob, 64, 65))) !== 0)
    return undefined;
  const owner = getAddress(sliceHex(blob, 12, 32));
  const offset = Number(BigInt(sliceHex(blob, 32, 64)));
  if (size(blob) < offset + 32) return undefined;
  const length = Number(BigInt(sliceHex(blob, offset, offset + 32)));
  if (size(blob) < offset + 32 + length) return undefined;
  return {
    type: "contract",
    owner,
    signature: sliceHex(blob, offset + 32, offset + 32 + length),
  };
}
/** User-facing name of a signable: Safe transaction or Safe message. */
export const kindLabel = (signable: { kind?: unknown }) =>
  signable.kind === "message" ? "Safe message" : "Safe transaction";
/** Throw unless `signable` is of `kind`, naming both kinds in the error. */
export function expectKind<K extends SafeSignable["kind"]>(
  signable: SafeSignable,
  kind: K,
): asserts signable is Extract<SafeSignable, { kind: K }> {
  if (signable.kind !== kind)
    throw new ErrorException(
      `expected a ${kindLabel({ kind })}, got a ${kindLabel(signable)}`,
    );
}
export function transactionSignable(
  chainId: number,
  safe: Address,
  tx: SafeTx,
  signatures: SafeSignature[] = [],
): SafeSignable {
  return {
    ...JSON.parse(exportSafeTransaction(chainId, safe, tx, [])),
    tx,
    signatures,
  };
}
export function signableTypedData(signable: SafeSignable): TypedDataDefinition {
  if (signable.kind === "transaction")
    return getSafeTxTypedData(signable.chainId, signable.safe, signable.tx);
  return {
    domain: getSafeDomain(signable.chainId, signable.safe),
    types: { EIP712Domain: SAFE_DOMAIN_TYPE, SafeMessage: SAFE_MESSAGE_TYPE },
    primaryType: "SafeMessage",
    message: { message: signable.message },
  } as const;
}
export function signableHashes(signable: SafeSignable) {
  if (signable.kind === "transaction") {
    const h = getSafeTxHashes(signable.chainId, signable.safe, signable.tx);
    return { ...h, finalHash: h.safeTxHash };
  }
  const typed = signableTypedData(signable);
  const domainHash = hashDomain({ domain: typed.domain!, types: typed.types });
  const messageHash = hashStruct({
    data: typed.message,
    primaryType: typed.primaryType,
    types: typed.types,
  });
  const finalHash = keccak256(concatHex(["0x1901", domainHash, messageHash]));
  return { domainHash, messageHash, finalHash, safeMessageHash: finalHash };
}
export function signingBytes(signable: SafeSignable): Hex {
  const h = signableHashes(signable);
  return concatHex(["0x1901", h.domainHash, h.messageHash]);
}
/** Safe message over `message` (32 bytes, or a parent's signing bytes for a
 *  nested owner). Pass `content` when the message comes from text or typed
 *  data, so it can be shown and posted to the service. */
export function messageSignable(
  chainId: number,
  safe: Address,
  message: Hex,
  content?: SafeMessageContent,
): SafeSignable {
  const signable: SafeSignable = {
    version: 1,
    kind: "message",
    chainId,
    safe: getAddress(safe),
    message: bytes(message),
    signatures: [],
    safeMessageHash: "0x",
    ...(content !== undefined ? { content } : {}),
  };
  signable.safeMessageHash = hashTypedData(signableTypedData(signable));
  return signable;
}
/** New Safe message from text or EIP-712 typed data. */
export const contentMessageSignable = (
  chainId: number,
  safe: Address,
  content: SafeMessageContent,
) => messageSignable(chainId, safe, messageContentHash(content), content);
export function parseSafeSignable(
  input: string | unknown,
  chainId?: number,
  safe?: Address,
): SafeSignable {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new ErrorException(
        "expected Safe transaction or Safe message JSON; a hash or nonce cannot recover transaction data without the Safe Transaction Service",
      );
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new ErrorException(
      "expected a Safe transaction or Safe message JSON object",
    );
  const p = raw as any;
  if (p.version !== undefined && p.version !== 1)
    throw new ErrorException(
      "unsupported Safe transaction or Safe message JSON version",
    );
  const id = safeUint(p.chainId, "chainId");
  if (id > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ErrorException("chainId exceeds safe integer range");
  if (!isAddress(p.safe))
    throw new ErrorException(
      "invalid Safe address in Safe transaction or Safe message JSON",
    );
  if (chainId !== undefined && id !== BigInt(chainId))
    throw new ErrorException(
      `${kindLabel(p)} chainId does not match the connected chain`,
    );
  if (safe && safe.toLowerCase() !== p.safe.toLowerCase())
    throw new ErrorException(
      `${kindLabel(p)} belongs to Safe ${p.safe}, not ${safe}`,
    );
  if (!Array.isArray(p.signatures))
    throw new ErrorException(`${kindLabel(p)} signatures must be an array`);
  const signatures = p.signatures.map(parseSafeSignature);
  if (p.kind === "message") {
    const signable = messageSignable(Number(id), p.safe, p.message, p.content);
    if (
      p.content !== undefined &&
      messageContentHash(p.content).toLowerCase() !==
        bytes(p.message).toLowerCase()
    )
      throw new ErrorException(
        "Safe message content does not hash to its message",
      );
    if (p.safeMessageHash?.toLowerCase() !== signableHashes(signable).finalHash)
      throw new ErrorException("safeMessageHash mismatch");
    return { ...signable, signatures };
  }
  const { tx } = importSafeTransaction(
    stringifySafeTransaction({ ...p, signatures: [] }),
    Number(id),
    p.safe,
  );
  return transactionSignable(Number(id), getAddress(p.safe), tx, signatures);
}
export async function signableSigners(signable: SafeSignable) {
  const hash = signableHashes(signable).finalHash;
  const seen = new Map<string, { owner: Address; signature: SafeSignature }>();
  for (const input of signable.signatures) {
    let s = parseSafeSignature(input);
    const owner =
      typeof s === "string"
        ? await recoverAddress({ hash, signature: s })
        : s.owner;
    const key = owner.toLowerCase();
    const old = seen.get(key);
    // Owners of an owner Safe sign in turn: their signatures accumulate in
    // one collecting entry per owner Safe.
    if (
      old &&
      isCollecting(old.signature) &&
      isCollecting(s) &&
      old.signature.message === s.message
    ) {
      const union = collectingSignable(signable.chainId, {
        ...s,
        signatures: [...old.signature.signatures, ...s.signatures],
      });
      s = {
        ...s,
        signatures: (await signableSigners(union)).map((x) => x.signature),
      };
    } else if (
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
export function packSignableSigners(
  signers: {
    owner: Address;
    signature:
      | Hex
      | { type: "contract"; owner: Address; signature: Hex }
      | { type: "approved" };
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
/** Every payload an owner Safe may sign for `signable`, across versions. */
const nestedPayloads = (signable: SafeSignable) =>
  ["1.3.0", "1.4.1", "1.5.0"].map((v) => nestedPayload(signable, v));
export async function mergeSafeSignables(
  base: string | SafeSignable,
  additions: unknown[],
): Promise<SafeSignable> {
  const signable = parseSafeSignable(base);
  for (let input of additions) {
    if (typeof input === "string" && input.trim().startsWith("{"))
      input = JSON.parse(input);
    if (input && typeof input === "object" && "chainId" in input) {
      const other = parseSafeSignable(input);
      if (other.chainId !== signable.chainId)
        throw new ErrorException(
          "cannot merge Safe transactions or Safe messages from different chains",
        );
      if (
        other.safe.toLowerCase() === signable.safe.toLowerCase() &&
        other.kind === signable.kind &&
        signableHashes(other).finalHash === signableHashes(signable).finalHash
      )
        signable.signatures.push(...other.signatures);
      else if (
        other.kind === "message" &&
        other.safe.toLowerCase() !== signable.safe.toLowerCase() &&
        nestedPayloads(signable).includes(other.message)
      ) {
        // A signed Safe message of an owner Safe over this item.
        signable.signatures.push({
          type: "contract",
          owner: other.safe,
          message: other.message,
          signatures: other.signatures,
        });
      } else
        throw new ErrorException(
          "cannot merge Safe transactions or Safe messages with different signed payloads",
        );
    } else signable.signatures.push(parseSafeSignature(input));
  }
  signable.signatures = (await signableSigners(signable)).map(
    (s) => s.signature,
  );
  return signable;
}
const validationAbi = parseAbi([
  "function approvedHashes(address,bytes32) view returns (uint256)",
]);
// Two ABIs rather than one overloaded function: a 32-byte payload would
// match both overloads.
const legacyEip1271Abi = parseAbi([
  "function isValidSignature(bytes,bytes) view returns (bytes4)",
]);
const eip1271Abi = parseAbi([
  "function isValidSignature(bytes32,bytes) view returns (bytes4)",
]);
/** Ask an owner Safe whether it approves `payload`, the way a Safe at
 *  `version` asks during execution. */
export async function isValidContractSignature(
  client: PublicClient,
  caller: Address,
  owner: Address,
  version: string,
  payload: Hex,
  signature: Hex,
): Promise<boolean> {
  try {
    if (usesHashEip1271(version))
      return (
        (await client.readContract({
          address: owner,
          // The parent Safe is the caller during execution.
          account: caller,
          abi: eip1271Abi,
          functionName: "isValidSignature",
          args: [payload, signature],
        })) === "0x1626ba7e"
      );
    return (
      (await client.readContract({
        address: owner,
        account: caller,
        abi: legacyEip1271Abi,
        functionName: "isValidSignature",
        args: [payload, signature],
      })) === "0x20c13b0b"
    );
  } catch {
    return false;
  }
}
export async function reviewSafeSignable(
  input: SafeSignable | string,
  client?: PublicClient,
  abis: Record<string, Abi> = {},
  /** Account that will send execTransaction: an owner sending it needs no
   *  signature, as the Safe accepts `msg.sender` as its own approval. */
  executor?: Address,
) {
  const signable = parseSafeSignable(input);
  const hashes = signableHashes(signable);
  const signers = await signableSigners(signable);
  const checks: {
    owner: Address;
    type: string;
    status: string;
    /** Owner-Safe progress: its owners' valid signatures of its threshold. */
    progress?: string;
    reason?: string;
  }[] = signers.map((s) => ({
    owner: s.owner,
    type: typeof s.signature === "string" ? "eoa" : "contract",
    status: typeof s.signature === "string" ? "recovered" : "unchecked",
  }));
  const packed = await packedSigners(signable.chainId, signers);
  let chain: {
    status: string;
    owners?: Address[];
    threshold?: string;
    nonce?: string;
    version?: string;
  } = { status: "unchecked" };
  let ready = false;
  let readiness = "unchecked";
  let packedSignatures = packSignableSigners(packed);
  let executorSigned = false;
  if (client) {
    const version = await assertSafeVersion(client, signable.safe);
    const [owners, threshold, nonce] = await Promise.all([
      getOwners(client, signable.safe),
      getThreshold(client, signable.safe),
      signable.kind === "transaction"
        ? getSafeNonce(client, signable.safe)
        : undefined,
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
        const payload = nestedPayload(signable, version);
        if (isCollecting(s.signature)) {
          const inner = await reviewSafeSignable(
            collectingSignable(signable.chainId, s.signature),
            client,
          );
          checks[i].progress =
            `${inner.signatures.filter((c) => c.status === "valid").length} of ${inner.chain.threshold}`;
        }
        if (isCollecting(s.signature) && s.signature.message !== payload) {
          checks[i].status = "invalid";
          checks[i].reason =
            `signed in another Safe version's format; Safe ${version} needs ${payload}`;
        } else
          checks[i].status = (await isValidContractSignature(
            client,
            signable.safe,
            s.owner,
            version,
            payload,
            (packed[i].signature as { signature: Hex }).signature,
          ))
            ? "valid"
            : isCollecting(s.signature)
              ? "incomplete"
              : "invalid";
      }
    }
    const usable: Parameters<typeof packSignableSigners>[0] = packed.filter(
      (_, i) => checks[i].status === "valid",
    );
    for (const owner of owners) {
      if (usable.some((s) => s.owner.toLowerCase() === owner.toLowerCase()))
        continue;
      const approved = await client.readContract({
        address: signable.safe,
        abi: validationAbi,
        functionName: "approvedHashes",
        args: [owner, hashes.finalHash],
      });
      if (approved > 0n) {
        usable.push({ owner, signature: { type: "approved" } });
        checks.push({ owner, type: "approved", status: "valid" });
      }
    }
    let executorApproval: (typeof usable)[number] | undefined;
    if (
      signable.kind === "transaction" &&
      executor &&
      owners.some((o) => o.toLowerCase() === executor.toLowerCase()) &&
      !usable.some((s) => s.owner.toLowerCase() === executor.toLowerCase())
    ) {
      executorApproval = {
        owner: executor,
        signature: { type: "approved" },
      };
      usable.push(executorApproval);
      checks.push({ owner: executor, type: "executor", status: "valid" });
    }
    const invalid = checks.some(
      (s) => s.status === "invalid" || s.status === "not-owner",
    );
    readiness = invalid
      ? "invalid-signatures"
      : signable.kind === "transaction" && nonce !== signable.tx.nonce
        ? nonce! > signable.tx.nonce
          ? "nonce-consumed"
          : "future-nonce"
        : BigInt(usable.length) < threshold
          ? "insufficient-signatures"
          : "ready";
    ready = readiness === "ready";
    const used = usable.slice(0, Number(threshold));
    packedSignatures = packSignableSigners(used);
    executorSigned = !!executorApproval && used.includes(executorApproval);
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
    const deployment = safeDeployment(signable.chainId);
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
  if (signable.kind === "transaction")
    decodedCalls.push(
      decodeCall(
        signable.tx.to,
        signable.tx.value,
        signable.tx.data,
        signable.tx.operation,
      ),
    );
  return {
    [signable.kind === "message" ? "safeMessage" : "safeTransaction"]: signable,
    typedData: signableTypedData(signable),
    signingBytes: signingBytes(signable),
    hashes,
    decodedCalls,
    signatures: checks,
    packedSignatures,
    /** The packed signatures rely on `executor` sending the transaction. */
    executorSigned,
    chain,
    ready,
    readiness,
    warnings:
      signable.kind === "transaction"
        ? collectSafeTxWarnings(signable.tx, safeDeployment(signable.chainId))
        : [],
  };
}
