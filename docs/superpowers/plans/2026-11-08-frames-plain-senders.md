# Frames: plain senders through eth_signTransaction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `frames:tx` from a plain address is sent by asking the connected wallet `eth_signTransaction` with a type `"0x6"` request; sends go where a frame network table says; `sizeBySimulation` leaves viem-frames.

**Architecture:** viem-frames gains the wallet-signed path (request format and parse, the send, a typed wallet error) next to the arbitrary-signature one, sharing fees, submission and receipt. The frames module routes both senders through `networks.ts` (1337 and the two local devnets), adds the EVML hint to a wallet's refusal, and gives body frames a default state-gas reservation.

**Tech Stack:** TypeScript, viem, `@forshtat/hegota-support`, bun test.

**Spec:** `docs/superpowers/specs/2026-11-08-frames-in-module-design.md` (section 2, step 3), `docs/superpowers/specs/2026-11-08-dev-wallet-design.md` (section 4).

## Global Constraints

- viem-frames never names EVML or EVMcrispr: its errors use its own API terms; onLog lines carry a level.
- No raw chain ids in user-facing messages (`chainLabel`, network names).
- Every string from a wallet, gateway or node in a message goes through `printable`.
- The wallet never chooses the mempool; nothing is sent unless the returned transaction is byte-for-byte the one asked for (with its signature) and recovers to the sender.
- Hint (exact): "send from a frame account with `--account`, or connect a wallet that signs frame transactions (the test wallet, experimental)".
- Commits: single short line, no attribution.

## Review Focus

1. A wallet that answers `eth_signTransaction` with a non-hex, a type-0x02 tx, or a tx for another chain/nonce/fee: refused before sending, nothing reaches the mempool.
2. A high-`s` or recovery-id-27 signature: refused (canonical form only).
3. The quick devnet never mines: a send there must return after admission, not hang two minutes then fail.
4. A host transport for a local devnet (terminal RPC override) wins over the table's URL.
5. A plain sender whose wallet is on another chain: told to `switch`, not shown a wallet error.

---

### Task 1: viem-frames drops `sizeBySimulation`

**Files:** `packages/viem-frames/src/{chain.ts,types.ts,actions.ts}`, `README.md`, `test/unit/client.test.ts`, `test/devnet/self-relay.test.ts`.

- [x] Test: "refuses to size the unlimited frames of a sender without code, and signs nothing" — rejects with `give every frame gas and stateGas`; no fetch. Delete the sizing-by-simulation test.
- [x] Run → FAIL (message still names sizeBySimulation).
- [x] Remove `sizeBySimulation` (option, type field, function, `SIZING_EXECUTION_GAS`); message: "The frames of a sender without code are not estimated (the estimate skips signatures, so the sender's default code cannot approve): give every frame gas and stateGas". Self-relay devnet test gives `gas: 50_000n, stateGas: 200_000n`. README section rewritten.
- [x] `bun test` in packages/viem-frames → pass. Commit `viem-frames: no sizing by a provisional signature`.

### Task 2: viem-frames sends a frame transaction its sender's wallet signs

**Files:** create `packages/viem-frames/src/wallet.ts`; modify `send.ts` (shared internals), `index.ts`; test `test/unit/wallet.test.ts`.

**Produces:**
- `formatFrameTransactionRequest(tx: FrameTx, profile?): FrameTransactionRpcRequest` — `{ type: "0x6", chainId, from, nonce, maxFeePerGas, maxPriorityFeePerGas, frames: [{ mode, flags, target, gasLimit, stateGasLimit, value, data }] }`, quantities as 0x-hex (mode and flags too), `target` null for the sender.
- `parseFrameTransactionRequest(request: unknown, profile?): FrameTx` — inverse; unsigned tx with one secp256k1 placeholder entry (signer `"0x"`); throws on a missing/ill-typed field.
- `class FrameWalletError extends Error` — the wallet refused or failed to sign; `message` "The wallet did not sign the frame transaction: <its text, printable>".
- `sendFrameTransactionFromWallet({ wallet, sender, frames, mempool, transport?, chain?, onLog?, receiptTimeoutMs?, maxFeePerGasCap?, signal?, waitForReceipt? }): Promise<{ hash, receipt? }>`.
- `sendFrameTransactionWithArbitrarySignature` gains `waitForReceipt?: boolean` (default true).

Tests (mock wallet = `custom` transport answering eth_accounts/eth_chainId/eth_signTransaction by signing with a local key, or tampering; mock gateway as in send.test.ts):
- [x] "format and parse are inverses" (round-trip a tx with a null target, an atomic flag, data).
- [x] "asks eth_signTransaction with the whole transaction, then sends the returned bytes": request deep-equals `formatFrameTransactionRequest(unsigned)`; `eth_sendFrameTransaction` (alt) / `eth_sendRawTransaction` (canonical, the raw as returned) once; returns its hash.
- [x] "refuses a returned transaction that differs from the one asked" (wallet bumps the nonce) → "The wallet returned another transaction than the one it was asked to sign: nothing was sent"; nothing submitted.
- [x] "refuses a signature by someone else" → "…recovers to 0x…, not the sender 0x…: nothing was sent".
- [x] "refuses a non-canonical signature" (high s) → "not canonical".
- [x] "a wallet's refusal is a FrameWalletError with its text" (wallet answers `-32601 method not supported`).
- [x] "refuses a wallet whose account is not the sender".
- [x] "waitForReceipt: false returns after admission" (no eth_getTransactionReceipt call).
- [x] Implement: factor `prepareFees`/`submitAndWait` out of `send.ts` (fees + cap + Fees log; submit + hash check + admission log + receipt); the wallet path: nonce of the sender (pending), unsigned with `secp256k1Placeholder(profile)`, request, parse returned hex via `decodeTx`, rebuild expected = unsigned with the returned entry's signature and compare `encodeTx` lowercase; signature 65 bytes `v||r||s`, v∈{0,1}, `s <= n/2`; `recoverAddress({ hash: sigHash(unsigned), signature: {r, s, yParity: v} })` equals sender.
- [x] `bun test` packages/viem-frames → pass; type-check. Commit `viem-frames: a frame transaction its sender's wallet signs`.

### Task 3: the frames module sends plain senders, where the network table says

**Files:** create `modules/frames/src/networks.ts`; modify `send.ts`, `describe.ts`, `layout.ts`, `commands/tx.ts`; tests `test/unit/{send,describe,layout,commands}.test.ts`, `test/helpers/frame-gateway.ts`.

**Produces:**
- `interface FrameNetwork { id; name; rpcUrl; sidecar: boolean; explorer?: string; mines: boolean }`; `frameNetworks: FrameNetwork[]` = the Alt-mempool devnet (gateway, sidecar, explorer, mines) and `chains.ts`' framesQuick (mines false) / framesMining (mines true), node RPCs, no sidecar; `frameNetwork(chainId)`; `frameChainOf(network)` (withFrames chain, tracer profile).
- `DEFAULT_STATE_GAS = 200_000n` in layout.ts: a body frame without `--state-gas` gets it.

Tests:
- [x] send: "asks a plain sender's wallet eth_signTransaction and sends its transaction" (1337, alt, gateway transport).
- [x] send: "a wallet that cannot sign frame transactions: its error, with the hint" — exact text `The wallet did not sign the frame transaction: <text>. Send from a frame account with \`--account\`, or connect a wallet that signs frame transactions (the test wallet, experimental)`.
- [x] send: "a chain outside the frame networks is refused by name" (Gnosis) for both senders: "Frame transactions are sent on the Alt-mempool devnet, the Frames quick devnet or the Frames mining devnet, not on Gnosis".
- [x] send: "the alt mempool on a network without one is refused" (81412, alt) → "…has no alt mempool: write `--mempool canonical`".
- [x] send: "a local devnet goes to the host's transport, else its node; the quick devnet is not waited on" (81411 canonical: host transport receives eth_sendRawTransaction; no receipt asked; log names that it never mines).
- [x] send: wallet on another chain → "write `switch <name key>`" (uses chain name).
- [x] describe: plain sender has no warning, a note "the wallet of the sender 0x… is asked to sign it as a type 0x06 transaction (eth_signTransaction); a wallet that does not sign frame transactions refuses it"; a chain outside the table warns for both senders.
- [x] layout/commands: body frames default to 200000 state gas; a plain sender's body frame without `--gas` stops at interpretation ("…has no gas limit: give its exec or send --gas (frames are not sized yet)").
- [x] Implement; remove `PLAIN_SENDER_REFUSAL`.
- [x] Frames unit tests pass; type-check. Commit `frames: plain senders sign through their wallet; a frame network table`.

### Task 4: live check, docs, specs

- [x] `modules/frames/test/devnet/plain.devnet.test.ts` (opt-in `EVMCRISPR_FRAME_DEVNET=1`): quick devnet, anvil #0 through a custom-transport wallet that signs `eth_signTransaction` requests with `parseFrameTransactionRequest` + `sign`, `frameAction.send` canonical: hash returned and the node knows it (`eth_getTransactionByHash` non-null or txpool). Run it.
- [x] Guide `frame-transactions.md`: caution, gas, limits; `tx` command description ("on a frame network"); codegen + docs regenerate; validate-docs.
- [x] Specs: step 3 marked done with date; open question about `chain.formatters.transactionRequest` ruling.
- [x] Full verification: type-check, biome, viem-frames + frames + terminal unit tests. Commit `frames: plain senders in the guide`.
