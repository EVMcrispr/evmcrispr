# frames module

EIP-8141 frame transactions: one transaction of many frames, verified and paid by contracts, sent through the ERC-8421 alternative mempool. Experimental: the alt-mempool devnet and local frame devnets, from a frame account or a wallet that signs frame transactions.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load frames
```

## Chains

Networks this module ships. They are available to `switch` as soon as the module is registered, with the RPC below unless the host overrides it.

| Chain | Key | Id | RPC | Explorer |
|-------|-----|----|-----|----------|
| Alt-mempool devnet (testnet) | `altMempoolDevnet` | `1337` | <https://altmempool.forshtat.com/rpc> | <https://explorer.altmempool.wtf> |
| Hegota devnet (testnet) | `hegotaDevnet` | `3151908` | <https://rpc1.hegota.ethrex.xyz> | <https://dora.hegota.ethrex.xyz> |
| Frames quick devnet (testnet) | `framesQuick` | `81411` | <http://127.0.0.1:8570> | — |
| Frames mining devnet (testnet) | `framesMining` | `81412` | <http://127.0.0.1:32003> | — |
| Frames alt-mempool devnet (testnet) | `framesAltMempool` | `81413` | <http://127.0.0.1:14337/rpc> | — |

## Commands

| Command | Description |
|---------|-------------|
| [frames:default](src/commands/default.md) | Make every call of the block a DEFAULT frame of a frame transaction: called by the entry point, not by the sender. Only works inside `frames:tx`. |
| [frames:new-account](src/commands/new-account.md) | Create the frame account of an owner (default `@me`) through the factory, and bind its address to <variable>. Idempotent: an existing account is only bound. |
| [frames:new-sponsor](src/commands/new-sponsor.md) | Deploy a frame sponsor that pays for the transactions of an account and bind its address to <variable>. |
| [frames:post-verify](src/commands/post-verify.md) | Check, after every other frame of a frame transaction, what it did: each assert or exec of the block is a POST_TX frame, and if one fails the transaction's body is reverted. The last statement of `frames:tx`; only on networks that run POST_TX frames (the Hegota devnet). |
| [frames:tx](src/commands/tx.md) | Send the calls of a block as one EIP-8141 frame transaction: a verify frame first, then one frame per call, `batch` groups atomic. Experimental: on the alt-mempool devnet and the local frame devnets. |
| [frames:verify](src/commands/verify.md) | Write one VERIFY frame of a frame transaction: a static call to the target that approves the transaction. Only works inside `frames:tx`. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@frames:account](src/helpers/account.md) | `address` | The address of an owner's frame account (salt default 0), whether or not it exists yet. Sends nothing. |

