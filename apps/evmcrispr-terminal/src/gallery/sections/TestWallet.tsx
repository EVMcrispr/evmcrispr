import type { SigningRequest } from "@evmcrispr/dev-wallet";
import { Button } from "@repo/ui";
import { useState } from "react";
import {
  SigningPanel,
  SigningRequestView,
} from "../../wallet/test-wallet/SigningPanel";
import { Both, Example, Section } from "../kit";

const ANVIL = { id: 31337, name: "Local anvil" };
const QUICK = { id: 81411, name: "Frames quick devnet" };
const ME = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TOKEN = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const word = (n: string) => n.padStart(64, "0");

const TRANSFER: SigningRequest = {
  kind: "transaction",
  method: "eth_sendTransaction",
  chain: ANVIL,
  from: ME,
  to: TOKEN,
  toLabel: "deployed in this session",
  deployment: false,
  value: 0n,
  valueShown: "0 ETH",
  call: {
    selector: "0xa9059cbb",
    functionName: "transfer",
    source: "standard",
    sourceLabel: "matches ERC-20",
    args: [
      { name: "recipient", type: "address", shown: BOB },
      { name: "amount", type: "uint256", shown: "1.5 USDC" },
    ],
    words: [],
  },
  nonce: 4,
  gas: 51_234n,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 1_000_000n,
  maxCostShown: "0.000102468 ETH",
};

const UNDECODED: SigningRequest = {
  ...TRANSFER,
  toLabel: undefined,
  call: {
    selector: "0xdeadbeef",
    source: "none",
    sourceLabel: "not decoded",
    words: ["0xdeadbeef", word("1"), word("2a")],
  },
};

const DEPLOYMENT: SigningRequest = {
  ...TRANSFER,
  to: undefined,
  toLabel: undefined,
  deployment: true,
  call: undefined,
};

const TYPED: SigningRequest = {
  kind: "typed-data",
  chain: QUICK,
  from: ME,
  domain: {
    name: "EVMcrispr Frame Account",
    version: "1",
    chainId: 81411,
    verifyingContract: TOKEN,
  },
  primaryType: "FrameTransaction",
  fields: [{ name: "sigHash", type: "bytes32", shown: `0x${"cd".repeat(32)}` }],
};

const TEXT: SigningRequest = {
  kind: "message",
  chain: ANVIL,
  from: ME,
  text: "Sign in to EVMcrispr",
  hex: "0x5369676e20696e20746f2045564d637269737072",
};

const BYTES: SigningRequest = { ...TEXT, text: undefined, hex: "0x00ff01" };

const FRAMES: SigningRequest = {
  kind: "frame-transaction",
  chain: QUICK,
  from: ME,
  frames: [
    {
      mode: "verify",
      gloss: "approves the transaction for the sender",
      scope: "execution and payment",
      atomic: false,
      value: 0n,
      valueShown: "0 ETH",
      gas: 30_000n,
      stateGas: 0n,
    },
    {
      mode: "sender",
      gloss: "a call made by the sender",
      atomic: true,
      target: TOKEN,
      value: 0n,
      valueShown: "0 ETH",
      call: TRANSFER.call,
      gas: 50_000n,
      stateGas: 200_000n,
    },
    {
      mode: "default",
      gloss: "a call made by the entry point",
      atomic: false,
      target: BOB,
      value: 10n ** 15n,
      valueShown: "0.001 ETH",
      gas: 21_000n,
      stateGas: 200_000n,
    },
  ],
  payer: "the sender",
  nonce: 0n,
  maxFeePerGas: 1_201_000_000n,
  maxPriorityFeePerGas: 1_000_000n,
  maxCostShown: "0.0006 ETH",
  sigHash: `0x${"ab".repeat(32)}`,
};

const STATES: [string, SigningRequest][] = [
  ["transaction, decoded (ERC-20, deployed in this session)", TRANSFER],
  ["transaction, not decoded", UNDECODED],
  ["deployment", DEPLOYMENT],
  ["typed data (a frame account's authorization)", TYPED],
  ["message as text", TEXT],
  ["message that is not text", BYTES],
  ["frame transaction", FRAMES],
];

export function TestWallet() {
  const [open, setOpen] = useState<SigningRequest | undefined>();
  return (
    <Section
      id="test-wallet"
      title="Test wallet"
      note="What the test wallet shows before it signs, read from the bytes it is asked to sign. Every request asks: Approve signs, Reject answers 4001."
    >
      <Example label="the prompt">
        {STATES.map(([label, request]) => (
          <Button
            key={label}
            size="sm"
            variant="neutral"
            onClick={() => setOpen(request)}
          >
            {label}
          </Button>
        ))}
      </Example>
      {STATES.map(([label, request]) => (
        <Example key={label} label={label}>
          <Both>
            <SigningRequestView request={request} />
          </Both>
        </Example>
      ))}
      <SigningPanel
        request={open}
        onApprove={() => setOpen(undefined)}
        onReject={() => setOpen(undefined)}
      />
    </Section>
  );
}
