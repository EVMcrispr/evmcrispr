---
title: "frames:new-account"
---

Deploy a frame account owned by an address (default `@me`) and bind its address to <variable>.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. The account is deployed now, by a transaction of its own.

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

<!-- HAND-WRITTEN -->

## How it works

`new-account` deploys a frame account now, with a transaction of its own signed by the connected wallet, and binds the address its receipt names to the variable. The account accepts frame signatures from its owner (default `@me`). It works only on chain 1337, the alt-mempool devnet.

```evml
load frames [new-account]

new-account $account
new-account $other --owner 0x0000000000000000000000000000000000000002
```
