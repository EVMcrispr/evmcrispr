# @evmcrispr/viem-frames

[EIP-8141](https://eips.ethereum.org/EIPS/eip-8141) frame transactions in
viem, submitted through the
[ERC-8421 alternative mempool](https://docs.altmempool.wtf/) or a node's
canonical mempool. Experimental: EIP-8141 is a draft, and the encoding follows
the devnets' (`@forshtat/hegota-support`'s ethrex profile), so expect breaking
changes with them. It ships no account contract: a contract sender's
signature is the caller's to produce.

```sh
bun add @evmcrispr/viem-frames viem
```

It is built the way `viem/tempo` adds Tempo's transaction type, with an
alt-mempool extension in the manner of `viem/account-abstraction`'s bundler
actions:

- **`withFrames(chain)`** gives a chain a serializer for type `0x06`, a
  receipt formatter (`payer`, `frameReceipts`) and a prepare hook that fills
  the nonce, fees and frame limits. A local account then signs a frame
  transaction with viem's own `signTransaction`: unsigned, the serializer
  produces exactly the bytes the signature hash is taken over.
- **`altMempoolActions()`** adds the sidecar's methods: `sendFrameTransaction`
  (`eth_sendFrameTransaction`, or `{ mempool: "canonical" }` for
  `eth_sendRawTransaction`), `prepareFrameTransaction`,
  `signFrameTransaction`, `estimateFrameTransactionGas`,
  `simulateFrameTransaction`, `getFrameTransactionStatus`, `requestFaucet`.
- **Frame builders**: `selfVerify()`, `onlyVerify()`, `pay(paymaster)`,
  `call({ to, data, value })` and `atomic([...])`.
- **`sendFrameTransactionFromWallet`** sends an account's frame transaction
  that its wallet (any EIP-1193 provider) signs through `eth_signTransaction`
  with a type `0x6` request, and checks what comes back before sending it.
- **`sendFrameTransactionWithArbitrarySignature`** sends a contract sender's
  transaction whose one `ARBITRARY` signature entry the caller produces.

The wire format comes from
[`@forshtat/hegota-support`](https://www.npmjs.com/package/@forshtat/hegota-support)
(MIT): every devnet runs its own revision of the drafts, and the library
describes each as a profile. The default is `ethrex-eip8141-tracer`, the
alt-mempool devnet's. `withFrames(chain, { profile })` sets another, and two
chains come ready:

- **`altMempoolDevnet`** (chain 1337): the alt-mempool workshop's devnet,
  through its sidecar.
- **`hegotaDevnet`** (chain 3151908): the public Hegota devnet, a plain ethrex
  node with EIP-7906 assertions, on `ethrexHegotaDevnetProfile`. That is the
  library's `ethrex-hegota-devnet` profile with the atomic batch flag the
  chain honours, which the library's leaves out. Its chain id is also
  Kurtosis' default: do not take a chain with that id for this one.

```ts
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { altMempoolActions, altMempoolDevnet, call, selfVerify } from "@evmcrispr/viem-frames";

const client = createWalletClient({
  account: privateKeyToAccount(key),
  chain: altMempoolDevnet,
  transport: http(),
}).extend(altMempoolActions());

await client.requestFaucet(client.account.address);
const hash = await client.sendFrameTransaction({
  frames: [
    selfVerify(),
    call({ to: recipient, value: 1_000_000_000n, gas: 50_000n, stateGas: 200_000n }),
  ],
});
```

## Gas

Validation frames carry their own limits (the builders' defaults: 30k for a
sender without code, 50k for a paymaster). Body frames without limits are
sized when the transaction is prepared:

- **A sender with code:** `eth_estimateFrameTransactionGas` on the sidecar.
- **A sender without code:** nothing estimates them. The sidecar's estimate
  drops signatures, so the protocol's default code never approves, and the
  node runs no frame of a transaction whose signature does not authenticate
  the sender. Such a sender gives every call `gas` and `stateGas`; unused
  state gas is refunded, so a generous reservation (one new account is
  183,600) costs nothing once mined.

## Limits

- **Signing:** one secp256k1 signature with an empty `msg`, by a local
  account, or by a wallet through `sendFrameTransactionFromWallet`: the
  wallet is asked the standard `eth_signTransaction` with a type `0x6`
  request (`formatFrameTransactionRequest`: the whole transaction, nonce and
  fees filled in), and the bytes it returns are sent only if they are that
  transaction, signed in canonical form by the sender. A wallet that does
  not implement EIP-8141 refuses with its own error (a `FrameWalletError`);
  `parseFrameTransactionRequest` is the other side, for a wallet that
  signs them. A contract sender signs through
  `sendFrameTransactionWithArbitrarySignature`: one `ARBITRARY` entry whose
  bytes the caller's `sign(sigHash)` returns, in whatever form the sender's
  VERIFY code checks (for an account that accepts its owner's EIP-712
  signature over the hash, the wallet's typed data signature). Neither
  sizes frames: they carry their limits. Both take `waitForReceipt: false`
  for a chain that never mines.
- **Not covered:** P256 signatures, paymaster signatures, keyed nonces
  other than key 0, recent roots, `deploy` frames.
- **Mining:** on 2026-11-06 the devnet admitted frame transactions but bundled
  none of them, ours or anyone else's (24 pending in
  `debug_bundler_dumpMempool`).

## Tests

- `bun run test:unit`: encoding against the library, signing and recovery,
  prepare and send against a mocked sidecar, receipts.
- `bun run test:devnet`: a real self-relayed transfer, admitted by the alt
  mempool. Add `VIEM_FRAMES_DEVNET_MINED=1` to also wait for it to be mined.
