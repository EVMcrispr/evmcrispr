# giveth module

Giveth protocol operations: donations, GIVpower staking, and GIVstream claims.

```evml
load giveth
```

## Commands

| Command | Description |
|---------|-------------|
| [giveth:boost](src/commands/boost.md) | Allocate your GIVpower across Giveth projects by percentage. With --with (or no option) it replaces your entire existing allocation; with --by it changes the listed projects by percentage points and the rest of your allocation absorbs the difference proportionally. Off-chain: signs you in to Giveth with the connected wallet (SIWE) and updates the allocation through the Giveth API; no transaction is sent, so it cannot be batched, and inside sim:fork the update is only logged, never sent. |
| [giveth:claim](src/commands/claim.md) | Harvest GIV rewards: collect the accrued GIVpower staking rewards (when the chain has a staking contract) and claim the GIV the GIVstream has already released. Does nothing when there is nothing to claim. |
| [giveth:donate](src/commands/donate.md) | Donate to Giveth projects and record the donation in Giveth's database (project totals, GIVbacks). A single project gets a direct wallet transfer; several projects ([amounts] to [slugs]) donate through the DonationHandler contract in one transaction. Signs you in to Giveth (SIWE) and sends the transactions immediately to report their hashes, so it cannot be batched. The zero address (@token(ETH), @token(XDAI)...) donates the chain's native token. |
| [giveth:donate-recurring](src/commands/donate-recurring.md) ⚗️ | Start, adjust, or stop a recurring Giveth donation: a Superfluid stream of the token to the anchor contract of the project (Optimism and Base only), recorded in the Giveth database. `total` sets the absolute rate (0 stops the donation), `more`/`less` adjust an existing one by a delta. The token is the underlying (use @token(SYM); the zero address streams the native SuperToken) or a SuperToken address; --wrap converts underlying into the SuperToken first. Signs you in to Giveth (SIWE) and sends the transactions immediately, so it cannot be batched. |
| [giveth:lock](src/commands/lock.md) | Lock staked GIV for a number of GIVpower rounds (2 weeks each) to multiply its GIVpower. Pass `max` as the amount to lock all staked GIV that is not already locked; a zero amount does nothing. Locked GIV cannot be unstaked until the last round ends and it is unlocked. |
| [giveth:stake](src/commands/stake.md) | Stake GIV for GIVpower, approving the staking contract automatically when needed. Pass `max` as the amount to stake the full GIV balance; a zero amount does nothing. On Gnosis GIV is wrapped into gGIV through the GIVgarden (which auto-stakes it); on Optimism and Polygon zkEVM it is staked directly. Staked GIV earns GIVstream rewards and can be locked for more GIVpower. |
| [giveth:unlock](src/commands/unlock.md) | Unlock GIV locks that ended at the given GIVpower round, making the tokens unstakeable again. Anyone can unlock for any account once the round is over; the round must be earlier than the current one (see @giveth:round). |
| [giveth:unstake](src/commands/unstake.md) | Unstake GIV from GIVpower: unwrap gGIV on Gnosis, withdraw from the staking contract on Optimism and Polygon zkEVM. Pass `max` as the amount to unstake everything the contract allows right now — staked GIV minus locks, where locks whose round already ended still count until giveth:unlock frees them (see @giveth:unlockable). A zero amount does nothing. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@giveth:anchor](src/helpers/anchor.md) ⚗️ | `address` | Resolve a Giveth project slug to its anchor contract on the current chain: the receiver of recurring donations, streamed with the superfluid module. Anchor contracts exist on Optimism and Base only. |
| [@giveth:boostedBy](src/helpers/boostedBy.md) | `array` | Projects an account boosts with its GIVpower, as a pair of same-length arrays [slugs percentages] sorted by percentage descending. Empty arrays when the account has no boosts. |
| [@giveth:claimable](src/helpers/claimable.md) | `number` | GIV an account can claim from the GIVstream right now (see giveth:claim). Counts a pending giveth:claim earlier in the script as already claimed. |
| [@giveth:givpower](src/helpers/givpower.md) | `number` | GIVpower balance of an account: staked GIV plus the extra power gained from locking. |
| [@giveth:lockable](src/helpers/lockable.md) | `number` | Staked GIV an account can lock (or unstake) right now: staked GIV minus everything the GIVpower contract counts as locked, including ended locks that were never unlocked (see @giveth:unlockable). Counts pending stake/lock actions earlier in the script, so it is what `lock max` resolves to. |
| [@giveth:project](src/helpers/project.md) | `address` | Resolve a Giveth project slug to its donation recipient address on the current chain. |
| [@giveth:round](src/helpers/round.md) | `number` | The current GIVpower round number (rounds last 2 weeks; locks unlock when their round is over). |
| [@giveth:stakable](src/helpers/stakable.md) | `number` | GIV in an account's wallet that giveth:stake can stake for GIVpower. Counts pending claim/stake/unstake actions earlier in the script, so it is what `stake max` resolves to. |
| [@giveth:staked](src/helpers/staked.md) | `number` | Raw GIV an account has staked for GIVpower: the gGIV balance on Gnosis, the deposit balance on Optimism and Polygon zkEVM. Includes locked GIV (see @giveth:unstakable) and counts pending giveth:stake/giveth:unstake actions earlier in the script. |
| [@giveth:unlockable](src/helpers/unlockable.md) | `number` | GIV in locks whose GIVpower round has ended but that giveth:unlock hasn't freed yet. Until unlocked, the GIVpower contract still counts it as locked, so it can be neither locked again nor unstaked. Time-aware inside sim:fork: after a wait, newly ended locks show up here. |
| [@giveth:unstakable](src/helpers/unstakable.md) | `number` | GIV an account can unstake at the current chain time: staked GIV minus the locks whose GIVpower round hasn't finished yet. Locks whose round has ended count as unstakable (unlocking is permissionless) but still need a giveth:unlock before giveth:unstake accepts them. Time-aware inside sim:fork: after a wait, ended locks drop out of the locked amount. Counts pending stake/unstake/lock actions earlier in the script. |

