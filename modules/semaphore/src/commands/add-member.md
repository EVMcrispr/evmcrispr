---
title: "semaphore:add-member"
---

Add an identity commitment (or an array of them) to a Semaphore group. Only the group admin can execute the resulting transaction.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
semaphore:add-member <commitment> <to> <group>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `commitment` | `any` | Runtime in smart blocks | Identity commitment, or an array of commitments |
| `to` | `command` | Build time | Keyword `to` |
| `group` | `number` | Runtime in smart blocks | Group id |

<!-- HAND-WRITTEN -->

## Examples

```evml novalidate
load semaphore
semaphore:add-member $commitment to $group

# Batch (single addMembers transaction)
semaphore:add-member [$alice $bob $carol] to $group
```

## See Also

- [semaphore:remove-member](remove-member.md)
- [@semaphore:members](../helpers/members.md)
