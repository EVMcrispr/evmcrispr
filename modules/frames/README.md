# frames module

EIP-8141 frame transactions: one transaction of many frames, verified and paid by contracts, sent through the ERC-8421 alternative mempool. Experimental: the alt-mempool devnet only, from the terminal with a frame account.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load frames
```

## Commands

| Command | Description |
|---------|-------------|
| [frames:default](src/commands/default.md) | Make every call of the block a DEFAULT frame of a frame transaction: called by the entry point, not by the sender. Only works inside `frames:tx`. |
| [frames:new-account](src/commands/new-account.md) | Deploy a frame account owned by an address (default `@me`) and bind its address to <variable>. |
| [frames:new-sponsor](src/commands/new-sponsor.md) | Deploy a frame sponsor that pays for the transactions of an account and bind its address to <variable>. |
| [frames:tx](src/commands/tx.md) | Send the calls of a block as one EIP-8141 frame transaction: a verify frame first, then one frame per call, `batch` groups atomic. Experimental: the alt-mempool devnet only. |
| [frames:verify](src/commands/verify.md) | Write one VERIFY frame of a frame transaction: a static call to the target that approves the transaction. Only works inside `frames:tx`. |

