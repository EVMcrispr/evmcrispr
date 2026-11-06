# @evmcrispr/viem-frames

Proof of concept: [EIP-8141](https://eips.ethereum.org/EIPS/eip-8141) frame
transactions in viem, submitted through the
[ERC-8421 alternative mempool](https://docs.altmempool.wtf/). Private to this
repo; nothing in EVMcrispr depends on it yet.

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

The wire format comes from
[`@forshtat/hegota-support`](https://www.npmjs.com/package/@forshtat/hegota-support)
(MIT): every devnet runs its own revision of the drafts, and the library
describes each as a profile. The default is `ethrex-eip8141-tracer`, the
alt-mempool devnet's.

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
- **A sender without code:** nothing can estimate without a real signature.
  The sidecar's estimate drops signatures, so the protocol's default code
  never approves, and the node runs no frame of a transaction whose signature
  does not authenticate the sender. So such a sender either gives every call
  `gas` and `stateGas`, or opts in with `sizeBySimulation: true`: the
  transaction is signed with generous limits and simulated with
  `ethrex_simulateFrameTransaction` on the chain's `simulationUrl` (the
  devnet's ethrex node; the sidecar does not serve the method). That
  provisional transaction is valid as signed, and whoever receives it could
  broadcast it (same calls and nonce, larger limits). Execution is what was
  used, ×1.25 + 5,000. The alt-mempool node reports no state gas, so 200,000
  is reserved (one new account is 183,600); unused state gas is refunded.

## Limits

- **Signing:** only a local account, with one secp256k1 signature and an
  empty `msg`. Browser wallets do not sign type `0x06`.
- **Not covered:** P256 or ARBITRARY signatures, paymaster signatures, keyed
  nonces other than key 0, recent roots, `deploy` frames.
- **Mining:** on 2026-11-06 the devnet admitted frame transactions but bundled
  none of them, ours or anyone else's (24 pending in
  `debug_bundler_dumpMempool`).

## Tests

- `bun run test:unit`: encoding against the library, signing and recovery,
  prepare and send against a mocked sidecar, receipts.
- `bun run test:devnet`: a real self-relayed transfer, admitted by the alt
  mempool. Add `VIEM_FRAMES_DEVNET_MINED=1` to also wait for it to be mined.
