---
title: "ens:renew"
---

Renew ENS domain registrations via bulk renewal.

## Syntax

```evml
ens:renew <domains> <duration>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `domains` | `any` | ENS label(s) or names to renew |
| `duration` | `any` | Renewal duration in seconds |

<!-- HAND-WRITTEN -->

## Examples

```
load ens

# Renew a single domain for one year (in seconds)
ens:renew "mydomain" 31536000

# Renew multiple domains at once
ens:renew ["domain1" "domain2" "domain3"] 31536000
```

## Notes

- Only works on Ethereum mainnet (chain ID 1)
- Uses the ENS bulk renewal contract

## See Also

- [@ens:contenthash](../helpers/contenthash.md) — encode content hashes
- [@ens](../../../std/src/helpers/md) — resolve ENS names
