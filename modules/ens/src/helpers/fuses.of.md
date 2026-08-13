---
title: "@ens:fuses.of"
experimental: true
sidebar:
  label: "@ens:fuses.of ⚗️"
---

Burned fuse names of a wrapped ENS name.

**On-chain (`@ens:fuses.of!`)**: Mainnet only; reads the raw fuse bitmap (compare against @ens:fuses) rather than decoded names, and an unwrapped name reads as 0 instead of erroring.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@ens:fuses.of(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | Wrapped ENS name |

<!-- HAND-WRITTEN -->

## On-chain face (@ens:fuses.of!)

Mainnet only. Reads word 1 of `NameWrapper.getData(uint256(node))` — the
raw uint32 fuse bitmap the chain actually holds — where the plain face
decodes it into fuse names. The plain `@ens:fuses` encoder maps names
back to the bitmap, so the two compose into readable assertions:

```evml novalidate
assert @ens:fuses.of!(myname.eth) == @ens:fuses([CANNOT_UNWRAP])
```

An unwrapped name reads as 0 (getData answers zeroes) instead of the
plain face's error.

## Examples

```evml
# TODO: add examples
```

## See Also
