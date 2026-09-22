---
title: "swaps:twap-cancel"
---

Cancel a CoW TWAP and revoke its sell-token allowance. Cancellation takes effect when mined; use twap-recover afterwards to return unused tokens.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. The concrete order identifies its hash and settlement contract.

## Syntax

```evml
swaps:twap-cancel <order>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `order` | `string` | Build time | JSON order reference bound by swaps:twap |

<!-- HAND-WRITTEN -->

## Example

Using the `$order` reference saved by `swaps:twap`:

```evml novalidate
swaps:twap-cancel $order
```

Run from the original controller context and chain. This removes the parent
conditional order and revokes its sell-token allowance in one Safe transaction.
Already filled parts are unaffected. Cancellation becomes effective when mined,
including invalidation of previously generated signatures for unfilled parts.

Unused tokens remain in the execution Safe. After cancellation has been mined,
run `swaps:twap-recover $order` in a separate transaction. Do not combine a
pending cancellation and a balance-based recovery in the same encoded batch.
