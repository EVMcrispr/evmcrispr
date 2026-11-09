// The EIP-8141 opcodes of the devnets' profile (ethrex eip8141-tracer, the
// Yul helpers in hegota-support's `yul/erc8421-workshop/`), as answers to
// a simulated frame transaction. Operands are listed top of stack first,
// as the helpers push them.
import type { SimOpcode, SimOpcodeResult } from "@evmcrispr/sdk";
import { eip8141TracerProfile as profile } from "@evmcrispr/viem-frames";
import {
  type Address,
  type Hex,
  hexToBigInt,
  isAddressEqual,
  pad,
  size,
  sliceHex,
} from "viem";

/** One frame as the simulation runs it. */
export interface SimFrame {
  mode: number;
  flags: number;
  /** The target with the sender filled in. */
  target: Address;
  data: Hex;
  value: bigint;
  gas: bigint;
  stateGas: bigint;
}

export type FrameStatus = "success" | "reverted" | "skipped" | "impersonated";

/** What the opcodes read and APPROVE records. */
export interface FrameContext {
  sender: Address;
  nonce: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  sigHash: Hex;
  frames: SimFrame[];
  /** The frame running now. */
  current: number;
  statuses: (FrameStatus | undefined)[];
  gasUsed: bigint[];
  /** The one signature entry: SECP256K1, signed by `signer`, 65 zero bytes. */
  signature: { scheme: number; signer: Address; data: Hex };
  /** What the frame running now approved, if anything. Set again, to the
   *  same value, when a backend replays the call. */
  approved?: number;
}

// Parameter ids (hegota-support contracts/Params.sol).
const TX = {
  TYPE: 0,
  NONCE: 1,
  SENDER: 2,
  MAX_PRIORITY_FEE_PER_GAS: 3,
  MAX_FEE: 4,
  MAX_COST: 6,
  BLOB_COUNT: 7,
  SIG_HASH: 8,
  FRAME_COUNT: 9,
  CURRENT_FRAME_INDEX: 10,
  SIGNATURE_COUNT: 11,
  STATE_GAS_LEFT: 12,
  LEGACY_NONCE: 13,
  NONCE_KEY_COUNT: 14,
  NONCE_KEY_0: 16,
} as const;
const FRAME = {
  RESOLVED_TARGET: 0,
  EXECUTION_GAS_LIMIT: 1,
  MODE: 2,
  FLAGS: 3,
  DATA_LENGTH: 4,
  STATUS: 5,
  ALLOWED_SCOPE: 6,
  ATOMIC_BATCH: 7,
  VALUE: 8,
  STATE_GAS_LIMIT: 9,
  EXECUTION_GAS_USED: 10,
} as const;
const SIG = {
  RESOLVED_SIGNER: 0,
  SCHEME: 1,
  MSG: 2,
  SIGNATURE_LENGTH: 3,
} as const;

const STATUS_CODE: Record<FrameStatus, bigint> = {
  reverted: 0n,
  success: 1n,
  skipped: 2n,
  impersonated: 1n,
};

const word = (address: Address) => hexToBigInt(address);
const fail = (why: string): SimOpcodeResult => ({ fail: why });

/** The most a copy may ask for: more is surely a bug, not a frame's data. */
const MAX_COPY = 1n << 20n;

/** Bytes `[offset, offset + length)` of `data`, zero past its end. */
function bytesAt(data: Hex, offset: bigint, length: bigint): Hex {
  const total = BigInt(size(data));
  const start = offset > total ? total : offset;
  const end = offset + length > total ? total : offset + length;
  const taken = start < end ? sliceHex(data, Number(start), Number(end)) : "0x";
  return pad(taken === "0x" ? "0x" : taken, {
    dir: "right",
    size: Number(length),
  });
}

export function frameOpcodes(ctx: FrameContext): SimOpcode[] {
  const frameAt = (i: bigint) =>
    i < BigInt(ctx.frames.length) ? ctx.frames[Number(i)] : undefined;
  const maxCost = () =>
    ctx.frames.reduce((sum, f) => sum + f.gas + f.stateGas, 0n) *
    ctx.maxFeePerGas;
  return [
    {
      opcode: 0xaa,
      name: "APPROVE",
      pops: 3,
      run({ address, operands: [offset, length, scope] }) {
        const frame = ctx.frames[ctx.current];
        if (!frame || frame.mode !== profile.frameModes.VERIFY)
          return fail("APPROVE outside a VERIFY frame");
        if (!isAddressEqual(address, frame.target))
          return fail(
            `APPROVE by ${address}, which is not the frame's target ${frame.target}`,
          );
        const asked = Number(scope! & 3n);
        const allowed = frame.flags & 3;
        if (asked === 0 || (asked & allowed) !== asked)
          return fail(
            `APPROVE of scope ${asked}, which the frame's flags (${allowed}) do not allow`,
          );
        if (
          asked & profile.approveScopes.EXECUTION &&
          !isAddressEqual(address, ctx.sender)
        )
          return fail(
            "APPROVE of execution by an account other than the sender",
          );
        ctx.approved = asked;
        return { return: { offset: offset!, size: length! } };
      },
    },
    {
      opcode: 0xb0,
      name: "TXPARAM",
      pops: 1,
      run({ operands: [param] }) {
        const frame = ctx.frames[ctx.current];
        switch (Number(param)) {
          case TX.TYPE:
            return { push: BigInt(profile.txType) };
          case TX.NONCE:
          case TX.LEGACY_NONCE:
            return { push: ctx.nonce };
          case TX.SENDER:
            return { push: word(ctx.sender) };
          case TX.MAX_PRIORITY_FEE_PER_GAS:
            return { push: ctx.maxPriorityFeePerGas };
          case TX.MAX_FEE:
            return { push: ctx.maxFeePerGas };
          case TX.MAX_COST:
            return { push: maxCost() };
          case TX.BLOB_COUNT:
            return { push: 0n };
          case TX.SIG_HASH:
            return { push: hexToBigInt(ctx.sigHash) };
          case TX.FRAME_COUNT:
            return { push: BigInt(ctx.frames.length) };
          case TX.CURRENT_FRAME_INDEX:
            return { push: BigInt(ctx.current) };
          case TX.SIGNATURE_COUNT:
            return { push: 1n };
          case TX.STATE_GAS_LEFT:
            // No state gas is measured: what the frame was given.
            return { push: frame?.stateGas ?? 0n };
          case TX.NONCE_KEY_COUNT:
            return { push: 1n };
          case TX.NONCE_KEY_0:
            return { push: 0n };
          default:
            return fail(`TXPARAM ${param} is not simulated`);
        }
      },
    },
    {
      opcode: 0xb1,
      name: "FRAMEDATALOAD",
      pops: 2,
      run({ operands: [offset, index] }) {
        const frame = frameAt(index!);
        if (!frame)
          return fail(`FRAMEDATALOAD of frame ${index}, which does not exist`);
        return { push: hexToBigInt(bytesAt(frame.data, offset!, 32n)) };
      },
    },
    {
      opcode: 0xb2,
      name: "FRAMEDATACOPY",
      pops: 4,
      run({ operands: [memOffset, offset, length, index] }) {
        const frame = frameAt(index!);
        if (!frame)
          return fail(`FRAMEDATACOPY of frame ${index}, which does not exist`);
        if (length === 0n) return { write: { offset: memOffset!, data: "0x" } };
        if (length! > MAX_COPY) return fail(`FRAMEDATACOPY of ${length} bytes`);
        return {
          write: {
            offset: memOffset!,
            data: bytesAt(frame.data, offset!, length!),
          },
        };
      },
    },
    {
      opcode: 0xb3,
      name: "FRAMEPARAM",
      pops: 2,
      run({ operands: [index, param] }) {
        const frame = frameAt(index!);
        if (!frame)
          return fail(`FRAMEPARAM of frame ${index}, which does not exist`);
        const i = Number(index);
        switch (Number(param)) {
          case FRAME.RESOLVED_TARGET:
            return { push: word(frame.target) };
          case FRAME.EXECUTION_GAS_LIMIT:
            return { push: frame.gas };
          case FRAME.MODE:
            return { push: BigInt(frame.mode) };
          case FRAME.FLAGS:
            return { push: BigInt(frame.flags) };
          case FRAME.DATA_LENGTH:
            return { push: BigInt(size(frame.data)) };
          case FRAME.STATUS: {
            const status = ctx.statuses[i];
            if (!status)
              return fail(`FRAMEPARAM STATUS of frame ${i}, which has not run`);
            return { push: STATUS_CODE[status] };
          }
          case FRAME.ALLOWED_SCOPE:
            return { push: BigInt(frame.flags & 3) };
          case FRAME.ATOMIC_BATCH:
            return {
              push: frame.flags & profile.flagBits.ATOMIC_BATCH ? 1n : 0n,
            };
          case FRAME.VALUE:
            return { push: frame.value };
          case FRAME.STATE_GAS_LIMIT:
            return { push: frame.stateGas };
          case FRAME.EXECUTION_GAS_USED:
            return { push: ctx.gasUsed[i] ?? 0n };
          default:
            return fail(`FRAMEPARAM ${param} is not simulated`);
        }
      },
    },
    {
      opcode: 0xb4,
      name: "SIGPARAM",
      pops: 2,
      run({ operands: [index, param] }) {
        if (index !== 0n)
          return fail(`SIGPARAM of signature ${index}, which does not exist`);
        switch (Number(param)) {
          case SIG.RESOLVED_SIGNER:
            return { push: word(ctx.signature.signer) };
          case SIG.SCHEME:
            return { push: BigInt(ctx.signature.scheme) };
          case SIG.MSG:
            // An empty msg: the signature covers the signature hash.
            return { push: hexToBigInt(ctx.sigHash) };
          case SIG.SIGNATURE_LENGTH:
            return { push: BigInt(size(ctx.signature.data)) };
          default:
            return fail(`SIGPARAM ${param} is not simulated`);
        }
      },
    },
    {
      opcode: 0xb5,
      name: "SIGDATACOPY",
      pops: 4,
      run({ operands: [memOffset, offset, length, index] }) {
        if (index !== 0n)
          return fail(
            `SIGDATACOPY of signature ${index}, which does not exist`,
          );
        if (length === 0n) return { write: { offset: memOffset!, data: "0x" } };
        if (length! > MAX_COPY) return fail(`SIGDATACOPY of ${length} bytes`);
        return {
          write: {
            offset: memOffset!,
            data: bytesAt(ctx.signature.data, offset!, length!),
          },
        };
      },
    },
  ];
}
