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
| `domains` | `string \| array` | ENS label(s) or names to renew |
| `duration` | `number` | Renewal duration, in time units (e.g. 1y) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Renew a single domain for one year
ens:renew "mydomain" 1y

# Renew multiple domains at once
ens:renew ["domain1" "domain2" "domain3"] 1y
```

## Notes

- Only works on Ethereum mainnet (chain ID 1)
- Uses the ENS bulk renewal contract

## See Also

- [@ens:contenthash](../helpers/contenthash.md) — encode content hashes
- [@ens](../../../std/src/helpers/md) — resolve ENS names
