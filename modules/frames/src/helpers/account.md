---
title: "@frames:account"
---

The address of an owner's frame account (salt default 0), whether or not it exists yet. Sends nothing.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@frames:account(owner salt?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `owner` | `address` | Owner of the account |
| `[salt]` | `number` | Which of the owner's accounts (default 0) |

<!-- HAND-WRITTEN -->

## How it works

The address `frames:new-account` creates for an owner and a salt, computed without sending anything: the account need not exist yet. The address is the same on every frame chain.

```evml
load frames [new-account]

# Fund an account before it exists, then create it.
set $account @frames:account(@me)
send $account --value 0.01e18
new-account $created
```
