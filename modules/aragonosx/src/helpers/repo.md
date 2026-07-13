---
title: "@aragonosx:repo"
---

Resolve a plugin repo subdomain to its PluginRepo address.

**Returns**: `address`

## Syntax

```evml
@aragonosx:repo(subdomain)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `subdomain` | `string` | Repo subdomain (e.g. `token-voting`) or address |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Resolve the token-voting plugin repo
set $repo @aragonosx:repo("token-voting")
print $repo
```
