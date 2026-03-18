---
title: "giveth:finalize-givbacks"
---

Finalize a GIVbacks distribution by executing batches from IPFS.

## Syntax

```evml
giveth:finalize-givbacks <hash>
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
# Finalize a GIVbacks distribution
giveth:finalize-givbacks QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr
```

<!-- HAND-WRITTEN -->

## See Also

- [initiate-givbacks](initiate-givbacks.md) — start a distribution
- [verify-givbacks](verify-givbacks.md) — verify and vote on a distribution
