---
title: "semaphore:create-group"
---

Create a Semaphore group on the canonical contract and bind the predicted group id to <variable>. Without --admin the transaction sender becomes the admin (correct through Safes and forwarders).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
semaphore:create-group <variable>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable to bind the new group id to |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--admin` | `address` | Runtime in smart blocks | Group admin (default: the transaction sender) |

<!-- HAND-WRITTEN -->

## Notes

- The group id is predicted from `groupCounter` at planning time — an
  external group creation landing before your transaction shifts it (the
  same character as `contracts:deploy` address prediction).
- Creating a group also primes the member cache, so later member scans
  only cover blocks after creation.

## Examples

```evml novalidate
load semaphore
semaphore:create-group $group
semaphore:add-member $membercommitment to $group
print "Created group" $group "with root" @semaphore:root($group)
```

## See Also

- [semaphore:add-member](add-member.md)
