---
title: "giveth:verify-givbacks"
---

Verify a GIVbacks vote against its IPFS proposal and vote if valid.

## Syntax

```evml
giveth:verify-givbacks <hash> <voteId>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `any` |  |
| `voteId` | `any` | Governance vote ID to verify |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--relayer` | `any` | Relayer address for transaction submission |

## Examples

```evml
# Verify a GIVbacks vote and cast vote
giveth:verify-givbacks QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr 49
```

<!-- HAND-WRITTEN -->

## See Also

- [initiate-givbacks](initiate-givbacks.md) — start a distribution
- [finalize-givbacks](finalize-givbacks.md) — execute the distribution
