---
title: "frames:new-sponsor"
---

Deploy a frame sponsor that pays for the transactions of an account and bind its address to <variable>.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. The sponsor is deployed now, by a transaction of its own.

## Syntax

```evml
frames:new-sponsor <variable>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable to bind the sponsor address to |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--for` | `address` | Build time | The account whose transactions the sponsor pays for |
| `--fund` | `number` | Build time | Wei sent with the deployment, to pay with (default 0) |
| `--owner` | `address` | Build time | Owner who may withdraw (default `@me`) |

<!-- HAND-WRITTEN -->

## How it works

`new-sponsor` deploys a sponsor contract that pays the gas of an account's frame transactions, and binds its address to the variable. `--fund` is the amount in wei sent with the deployment; `--owner` (default `@me`) may withdraw. It works only on chain 1337.

```evml
load frames [new-account new-sponsor]

new-account $account
new-sponsor $sponsor --for $account --fund 1000000000000000000
```
