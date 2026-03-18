---
title: "giveth:initiate-givbacks"
---

Initiate a GIVbacks distribution through DAO governance.

## Syntax

```evml
giveth:initiate-givbacks <hash>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `any` | IPFS hash of the distribution data |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--relayer` | `any` | Relayer address for transaction submission |

## Examples

```evml
# Initiate a GIVbacks distribution
giveth:initiate-givbacks QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws1
```

<!-- HAND-WRITTEN -->

## See Also

- [verify-givbacks](verify-givbacks.md) — verify and vote on a distribution
- [finalize-givbacks](finalize-givbacks.md) — execute the distribution
