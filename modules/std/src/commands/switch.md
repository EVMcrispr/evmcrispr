---
title: "switch"
---

Change the acting context: the chain, the account (--as), or both. With a block, for that block; without one, until the end of the block it is written in.

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
switch [networkNameOrId] [block]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `[networkNameOrId]` | `chain` | Build time | Chain name in camelCase as exported by viem (e.g. `mainnet`, `gnosis`, `baseSepolia`, `polygonZkEvm`) or numeric chain ID |
| `[block]` | `block` | Build time | Commands to run on that chain and as that account; both are put back when the block ends. Without it, the change lasts until the end of the enclosing block, or of the script at the top level. |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--as` | `address` | Build time | Account the steps are run by: what `@me` resolves to. A simulation impersonates it; a real run only accepts the connected account. |

## Examples

```evml
# Switch by chain name
switch gnosis

# Testnets and multi-word chains use camelCase viem names
switch baseSepolia

# Switch by chain ID
switch 137

# Run a block on another chain; the chain is put back when it ends
switch optimism (
  exec 0x44fA8E6f47987339850636F88629646662444217 "foo()"
)
```

<!-- HAND-WRITTEN -->

## The acting context

`switch` is the one command that changes who acts and where: the chain,
the account (`--as`), or both. It needs at least one of the two.

```evml
load sim

set $who 0x44fA8E6f47987339850636F88629646662444217

sim:fork (
  # On another chain, for this block only
  switch gnosis (
    print @me
  )

  # As another account, for this block only
  switch --as $who (
    print @me
  )

  # Both
  switch gnosis --as $who (
    print @me
  )
)
```

- **With a block**, the change starts and ends within that block.
- **Without a block**, the change lasts until the end of the block the
  `switch` is written in: the `if`, the `loop` iteration, the `def` body,
  the `sim:fork`. At the top level of the script there is no such block,
  so it lasts until the next bare `switch` or the end of the script.
- Either way, when the block ends the chain and the account it was
  entered with are back, also when a command in it fails or a
  `loop break` leaves it. A call to a `def` never leaves its caller on
  another chain or as another account.
- **Inside `--as`, `@me` is that account**: for transactions, for message
  signing and for any read that uses `@me`.
  [`@sender`](../helpers/sender.md) keeps its meaning: the account an
  enclosing block executes as (a Safe, a DAO), and `@me` outside of one.
- **In a simulation `--as` impersonates** the account. **In a real run** it
  must be the connected account: with any other, the script stops before
  sending and names both. A script that opens with `switch --as <address>`
  is addressed to that signer.
- `--as` replaces the `--from` option of `exec`, `send`, `contracts:deploy`
  and `proxies:clone`, which is deprecated: wrap the command in
  `switch --as <address> ( … )` instead.

## The two scopes

```evml
load sim

sim:fork (
  if true (
    # Until the end of this if
    switch gnosis
    print @me
  )
  # Back on the chain the fork started on

  # Only inside its own block
  switch optimism (
    print @me
  )
)
```

## See Also

- [sim:fork](../../../sim/src/commands/fork.md) — takes the same two as options, `--as` and `--on`

- [eez:on](../../../eez/src/commands/on.md) — run a block on another EEZ chain from the current one, through cross-chain proxies, without moving the wallet
