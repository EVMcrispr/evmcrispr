---
title: "semaphore:add-member"
---

Add an identity commitment (or an array of them) to a Semaphore group. Only the group admin can execute the resulting transaction.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
semaphore:add-member <commitment> <to> <group>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `commitment` | `any` | Identity commitment, or an array of commitments |
| `to` | `command` | Keyword `to` |
| `group` | `number` | Group id |

<!-- HAND-WRITTEN -->

## Examples

```
load semaphore
semaphore:add-member $commitment to $group

# Batch (single addMembers transaction)
semaphore:add-member [$alice $bob $carol] to $group
```

## See Also

- [semaphore:remove-member](remove-member.md)
- [@semaphore:members](../helpers/members.md)
