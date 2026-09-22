---
title: Smart batches
---

A smart batch lets one transaction use values produced while that transaction runs. You can redeem vault shares and deposit exactly the returned assets into another vault, without knowing the redemption amount in advance.

Commands run in order, so later commands can see changes made by earlier ones. All steps use the same account and network. If a contract call or assertion fails, the whole batch reverts.

## Move funds between vaults

This example moves a Safe's full share balance from one vault to another. Both vaults must use the same underlying asset and support synchronous ERC-4626 deposits and redemptions. Replace the placeholder addresses with your Safe and vaults.

```evml
load safe
load vault
set $safe 0x1111111111111111111111111111111111111111
set $oldVault 0x2222222222222222222222222222222222222222
set $newVault 0x3333333333333333333333333333333333333333

safe:execute! $safe (
  vault:redeem max of $oldVault -> [$assets]
  vault:deposit $assets into $newVault
)
```

`-> [$assets]` captures the amount actually returned by the redemption. The next command approves and deposits exactly that amount into the new vault. Any underlying tokens the Safe already held remain untouched, and the new vault shares belong to the Safe.

The amount is determined when the transaction executes, so the script still uses the redemption's actual result if the vault's share price changes after the proposal is signed.

## Choose your account

| What you want to do | Command | Wallet to connect |
| --- | --- | --- |
| Run a batch from a smart account | `batch! (...)` | The compatible smart account itself |
| Create a proposal for Safe owners to sign | `safe:propose! <safe> (...)` | A Safe owner wallet |
| Execute a Safe transaction with the required signatures | `safe:execute! <safe> (...)` | A Safe owner wallet |

To prepare the vault migration as a proposal, change `safe:execute!` to `safe:propose!`. To use a compatible connected smart account, replace `safe:execute! $safe (` with `batch! (`.

For `batch!`, the connected account must support ERC-7579 and already have Biconomy's composability executor installed. EVMcrispr checks compatibility on the selected network before signing; it does not create accounts, install modules, or request EIP-7702 authorization. Nexus and Kernel account execution has been tested, but their WalletConnect integrations have not yet been verified.

For a Safe, connect an owner wallet. Smart batches cannot currently be submitted through EVMcrispr running as a Safe App. The Safe makes the calls and spends its own funds. In a proposal, live values are resolved when the transaction executes, not when owners sign it.

`@sender` means the account making the calls; `@me` means the connected wallet. Inside a Safe block, `@sender` is the Safe and `@me` is its connected owner. Use `@sender` when reading the batch account's balance or receiving assets into that account.

## Capture returned values

Write `-> [...]` after a command to name its return values:

| Capture | Meaning |
| --- | --- |
| `-> [$result]` | Save the first returned value |
| `-> [$first $second]` | Save the first two values |
| `-> [_ $second]` | Skip the first value and save the second |
| `-> [[$amount $recipient] _]` | Unpack the first returned tuple and ignore the second result |

Captured variables are available only to later commands in the same smart block. You cannot copy them into ordinary variables with `set` or use them after the block ends.

Use return capture when a state-changing command produces a value you need later. For a direct `exec` call, include the output types in the function signature: for example, `"deposit(uint256,address) returns (uint256)"` declares a returned share amount, which you can capture with `-> [$shares]`. For read-only values, use an on-chain helper such as `@balance!(...)` or a `::!` call expression instead of `exec`.

You can capture integers, addresses, booleans, fixed-size bytes, and tuples or fixed-size arrays made from these types. Dynamic strings, bytes and arrays are not supported as captured results. Captures must match the declared output types. If a call returns too little data, the batch fails.

Commands such as `vault:deposit` capture the protocol call's result, even when they also add approvals. A command without declared return types cannot provide a capture.

Event capture keeps its existing spelling, `-> EventName(...) [...]`. The opening bracket directly after `->` selects a returned value instead. Put event, transaction-hash and required error captures on the outer batch command; to require a revert inside the batch, assert it on-chain instead, as in `assert @reverts!(0xTarget::!{withdraw(uint256)() 100} -!> InsufficientBalance(uint256,uint256))`. Optional error captures inside the block can handle failures while preparing the script; they do not catch a contract revert and let the remaining batch continue.

## Read values during execution

The `!` on a helper asks for its on-chain value. For example, `@balance!($asset @sender)` reads the balance when that step runs. The ordinary `@balance(...)` keeps its usual behavior of reading while EVMcrispr prepares the script, including restrictions on reads inside batches.

Commands inside the block keep their ordinary names: use `token:transfer`, not `token:transfer!`. Each command's reference page marks which arguments and options accept runtime values. Amounts and recipients commonly do; choices such as which protocol or vault to use may need to be known before execution.

Values read during execution can feed subsequent calls and assertions. They cannot decide which `if` branch to take, how many times a loop runs, which module to load, or which function signature to use. You can still use loops and user-defined commands whose structure is known while preparing the batch.

## Stop a stream, unwrap, and transfer the balance

A streaming balance changes as time passes, and stopping a stream releases its buffer deposit. The amount available when a Safe proposal executes can therefore differ from the balance you saw when preparing it.

This example closes the Safe's last outgoing stream for an ERC-20-backed SuperToken, such as USDCx. It then unwraps the available balance and transfers the Safe's entire underlying-token balance to a recipient, including any underlying tokens it already held. Replace the placeholder addresses with your Safe, SuperToken, stream receiver, and destination.

```evml
load safe
load superfluid
load token
set $safe 0x1111111111111111111111111111111111111111
set $superToken 0x2222222222222222222222222222222222222222
set $streamReceiver 0x3333333333333333333333333333333333333333
set $recipient 0x4444444444444444444444444444444444444444
set $asset @superfluid:underlying($superToken)

safe:execute! $safe (
  superfluid:stop-stream $superToken to $streamReceiver
  superfluid:unwrap @balance!($superToken @sender) of $superToken
  token:transfer @balance!($asset @sender) $asset to $recipient
)
```

The batch does three things, in order:

1. Stops the stream and releases its buffer deposit.
2. Reads the now-available SuperToken balance and unwraps it.
3. Reads the underlying-token balance after unwrapping and transfers it to `$recipient`.

The unwrap and transfer amounts are both determined during execution. The first `@balance!` sees the released buffer; the second sees the tokens received from unwrapping. Reading each balance in its own token also accounts for differences in decimal units.
