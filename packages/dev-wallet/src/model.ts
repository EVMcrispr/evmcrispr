// What the test wallet shows before it signs: built from the bytes it is
// asked to sign, never from the page's description of them.
import type { Address, Hex } from "viem";
import type { DecodedCall } from "./decode";

export interface ChainInfo {
  id: number;
  name: string;
}

/** An ordinary transaction, to send (`eth_sendTransaction`) or to sign. */
export interface TransactionRequestModel {
  kind: "transaction";
  method: "eth_sendTransaction" | "eth_signTransaction";
  chain: ChainInfo;
  from: Address;
  /** Undefined for a deployment. */
  to?: Address;
  /** What the wallet knows of `to` ("deployed in this session"). */
  toLabel?: string;
  deployment: boolean;
  value: bigint;
  /** In the chain's currency. */
  valueShown: string;
  call?: DecodedCall;
  nonce: number;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  /** gas × maxFeePerGas + value, in the chain's currency. */
  maxCostShown: string;
}

export interface TypedDataField {
  /** Dotted for nested structs, `[i]` for array items. */
  name: string;
  type: string;
  shown: string;
}

export interface TypedDataRequestModel {
  kind: "typed-data";
  chain: ChainInfo;
  from: Address;
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: Address;
    salt?: Hex;
  };
  primaryType: string;
  fields: TypedDataField[];
}

export interface MessageRequestModel {
  kind: "message";
  chain: ChainInfo;
  from: Address;
  /** The message as text when it is printable UTF-8. */
  text?: string;
  hex: Hex;
}

export interface FrameModel {
  /** "verify", "sender", "default", or the profile's name of the mode. */
  mode: string;
  /** What the mode means. */
  gloss: string;
  /** What a verify frame approves. */
  scope?: "nothing" | "execution" | "payment" | "execution and payment";
  /** This frame and the next run atomically. */
  atomic: boolean;
  /** Undefined: the sender. */
  target?: Address;
  targetLabel?: string;
  value: bigint;
  valueShown: string;
  call?: DecodedCall;
  gas: bigint;
  stateGas: bigint;
}

export interface FrameTransactionRequestModel {
  kind: "frame-transaction";
  chain: ChainInfo;
  /** The transaction's sender: the wallet's account. */
  from: Address;
  frames: FrameModel[];
  /** "the sender", "the paymaster 0x…", or "no frame approves payment". */
  payer: string;
  nonce: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  /** The frames' limits at the max fee plus their values, in the chain's currency. */
  maxCostShown: string;
  sigHash: Hex;
}

export type SigningRequest =
  | TransactionRequestModel
  | TypedDataRequestModel
  | MessageRequestModel
  | FrameTransactionRequestModel;
