// A frame transaction (EIP-8141, type 0x06) asked through the standard
// `eth_signTransaction`: read from the request, shown frame by frame, and
// signed by the sender over its signature hash.
import {
  ATOMIC_BATCH_FLAG,
  parseFrameTransactionRequest,
  eip8141TracerProfile as profile,
} from "@evmcrispr/viem-frames";
import { encodeTx, sigHash } from "@forshtat/hegota-support/tx";
import {
  type Address,
  concat,
  type Hex,
  isAddressEqual,
  numberToHex,
  parseSignature,
} from "viem";
import type { HDAccount } from "viem/accounts";
import type { DecodedCall } from "./decode";
import { TestWalletError } from "./errors";
import type {
  ChainInfo,
  FrameModel,
  FrameTransactionRequestModel,
  SigningRequest,
} from "./model";

const INVALID = -32602;

const nameOf = (table: Record<string, number>, value: number) =>
  Object.entries(table)
    .find(([, v]) => v === value)?.[0]
    ?.toLowerCase()
    .replaceAll("_", " ");

const GLOSS: Record<string, string> = {
  verify: "approves the transaction",
  sender: "a call made by the sender",
  default: "a call made by the entry point",
};

/** A verify frame's approval scope, by the profile's names. */
const scopeOf = (flags: number): FrameModel["scope"] => {
  const scope = flags & 0x3;
  const { PAYMENT, EXECUTION, EXECUTION_AND_PAYMENT } = profile.approveScopes;
  if (scope === EXECUTION_AND_PAYMENT) return "execution and payment";
  if (scope === EXECUTION) return "execution";
  if (scope === PAYMENT) return "payment";
  return "nothing";
};

/** Whether a verify frame's scope includes payment. */
const approvesPayment = (flags: number) =>
  (flags & 0x3 & profile.approveScopes.PAYMENT) !== 0;

export async function signFrameRequest(
  request: unknown,
  {
    account,
    chain,
    nativeShown,
    ask,
    decode,
    labelOf,
  }: {
    account: HDAccount;
    chain: ChainInfo;
    nativeShown: (wei: bigint) => string;
    ask: (request: SigningRequest) => Promise<void>;
    decode: (to: Address, data: Hex) => Promise<DecodedCall | undefined>;
    labelOf: (address: Address) => string | undefined;
  },
): Promise<Hex> {
  let tx: ReturnType<typeof parseFrameTransactionRequest>;
  try {
    tx = parseFrameTransactionRequest(request, profile);
  } catch (error) {
    throw new TestWalletError(
      INVALID,
      `The frame transaction cannot be read: ${(error as Error).message}`,
    );
  }
  if (Number(tx.chainId) !== chain.id)
    throw new TestWalletError(
      INVALID,
      `The frame transaction is for another chain than the ${chain.name}, which the wallet is on`,
    );
  if (!isAddressEqual(tx.sender, account.address))
    throw new TestWalletError(
      4100,
      `The frame transaction's sender ${tx.sender} is not the selected account ${account.address}`,
    );
  const verify = profile.frameModes.VERIFY;
  const frames: FrameModel[] = await Promise.all(
    tx.frames.map(async (f) => {
      const mode = nameOf(profile.frameModes, f.mode) ?? `mode ${f.mode}`;
      const target = f.target ?? undefined;
      return {
        mode,
        gloss:
          f.mode === verify && target === undefined
            ? "approves the transaction for the sender"
            : (GLOSS[mode] ?? "a frame of a mode the wallet does not know"),
        scope: f.mode === verify ? scopeOf(f.flags) : undefined,
        atomic: (f.flags & ATOMIC_BATCH_FLAG) !== 0,
        target,
        targetLabel: target ? labelOf(target) : undefined,
        value: f.value,
        valueShown: nativeShown(f.value),
        call: await decode(target ?? tx.sender, f.data),
        gas: f.limits.execution,
        stateGas: f.limits.state,
      };
    }),
  );
  const paying = tx.frames.find(
    (f) => f.mode === verify && approvesPayment(f.flags),
  );
  const payer = !paying
    ? "no frame approves payment"
    : paying.target === null || isAddressEqual(paying.target, tx.sender)
      ? "the sender"
      : `the paymaster ${paying.target}`;
  const gas = tx.frames.reduce(
    (sum, f) => sum + f.limits.execution + f.limits.state,
    0n,
  );
  const hash = sigHash(profile, tx);
  const model: FrameTransactionRequestModel = {
    kind: "frame-transaction",
    chain,
    from: account.address,
    frames,
    payer,
    nonce: tx.nonceSeq,
    maxFeePerGas: tx.fees.maxFeePerGas,
    maxPriorityFeePerGas: tx.fees.maxPriorityFeePerGas,
    maxCostShown: nativeShown(
      gas * tx.fees.maxFeePerGas +
        tx.frames.reduce((sum, f) => sum + f.value, 0n),
    ),
    sigHash: hash,
  };
  await ask(model);
  const signature = parseSignature(await account.sign({ hash }));
  const packed = concat([
    numberToHex(signature.yParity ?? 0, { size: 1 }),
    signature.r,
    signature.s,
  ]);
  return encodeTx(profile, {
    ...tx,
    signatures: [{ ...tx.signatures[0]!, signature: packed }],
  });
}
