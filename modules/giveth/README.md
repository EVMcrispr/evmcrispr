# giveth module

Giveth protocol operations: donations, GIVpower staking, and GIVstream claims.

```evml
load giveth
```

## Commands

| Command | Description |
|---------|-------------|
| [giveth:boost](src/commands/boost.md) | Allocate your GIVpower across Giveth projects by percentage. Off-chain: signs you in to Giveth with the connected wallet (SIWE) and replaces your entire existing boost allocation through the Giveth API; no transaction is sent, so it cannot be batched or simulated. |
| [giveth:claim](src/commands/claim.md) | Harvest GIV rewards: collect the accrued GIVpower staking rewards into the GIVstream (when the chain has a staking contract) and claim the GIV the GIVstream has already released. |
| [giveth:donate](src/commands/donate.md) | Donate a token to a Giveth project through the Giveth DonationHandler, approving it automatically when needed. The zero address (@token(ETH), @token(XDAI)...) donates the chain's native token. Wrap several donates in std batch to donate to many projects in one transaction. |
| [giveth:lock](src/commands/lock.md) | Lock staked GIV for a number of GIVpower rounds (2 weeks each) to multiply its GIVpower. Locked GIV cannot be unstaked until the last round ends and it is unlocked. |
| [giveth:stake](src/commands/stake.md) | Stake GIV for GIVpower, approving the staking contract automatically when needed. On Gnosis GIV is wrapped into gGIV through the GIVgarden (which auto-stakes it); on Optimism and Polygon zkEVM it is staked directly. Staked GIV earns GIVstream rewards and can be locked for more GIVpower. |
| [giveth:unlock](src/commands/unlock.md) | Unlock GIV locks that ended at the given GIVpower round, making the tokens unstakeable again. Anyone can unlock for any account once the round is over; the round must be earlier than the current one (see @giveth:round). |
| [giveth:unstake](src/commands/unstake.md) | Unstake GIV from GIVpower: unwrap gGIV on Gnosis, withdraw from the staking contract on Optimism and Polygon zkEVM. Pass `max` as the amount to unstake the full staked balance. Locked GIV cannot be unstaked until it is unlocked. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@giveth:anchor](src/helpers/anchor.md) | `address` | Resolve a Giveth project slug to its anchor contract on the current chain — the receiver of recurring donations, streamed with the superfluid module. Anchor contracts exist on Optimism and Base only. |
| [@giveth:boostedBy](src/helpers/boostedBy.md) | `array` | Projects an account boosts with its GIVpower, as a pair of same-length arrays [slugs percentages] sorted by percentage descending. Empty arrays when the account has no boosts. |
| [@giveth:claimable](src/helpers/claimable.md) | `number` | GIV an account can claim from the GIVstream right now (see giveth:claim). |
| [@giveth:givpower](src/helpers/givpower.md) | `number` | GIVpower balance of an account: staked GIV plus the extra power gained from locking. |
| [@giveth:project](src/helpers/project.md) | `address` | Resolve a Giveth project slug to its donation recipient address on the current chain. |
| [@giveth:round](src/helpers/round.md) | `number` | The current GIVpower round number (rounds last 2 weeks; locks unlock when their round is over). |

