---
title: "frames:new-account"
---

Create the frame account of an owner (default `@me`) through the factory, and bind its address to <variable>. Idempotent: an existing account is only bound.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. The account is created now, by a transaction of its own.

## Syntax

```evml
frames:new-account <variable>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable to bind the account address to |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--owner` | `address` | Build time | Owner whose signature the account accepts (default `@me`) |
| `--salt` | `number` | Build time | Which of the owner's accounts (default 0) |

<!-- HAND-WRITTEN -->

## How it works

`new-account` makes the owner's frame account through the frame account factory, with a transaction signed by the connected wallet, and binds its address to the variable. The account accepts frame signatures from its owner (default `@me`).

- **Predictable.** The address follows from the owner and the salt alone (default 0), the same on every frame chain: [`@frames:account`](../helpers/account/) gives it before the account exists, so it can be funded first.
- **Idempotent.** On a chain where the account exists, nothing is sent: the address is only bound. `--salt` gives an owner several accounts.
- **The factory comes first.** On a chain without it, the implementation and the factory are deployed first (up to two transactions, through the deterministic deployer), then the account; a chain left half-deployed is resumed. Gas is the wallet's estimate.
- **Frame chains that mine:** the alt-mempool devnet and the local mining devnet (`switch framesMining`). The quick devnet (`framesQuick`) never mines, so the command refuses it; `@frames:account` works there.

Accounts created before the factory existed are devnet leftovers: create a new one.

```evml
load frames [new-account]

new-account $account
new-account $second --salt 1
new-account $other --owner 0x0000000000000000000000000000000000000002
```
