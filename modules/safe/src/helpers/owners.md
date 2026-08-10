---
title: "@safe:owners"
---

Owner addresses of a Safe.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@safe:owners(safe?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[safe]` | `address` | Safe address (defaults to the context Safe or connected account) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load safe

set $owners @safe:owners(0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67)
print $owners
```

## On-chain face (@owners!)

The Safe's `getOwners()` read happens on-chain at assertion time as an
ARRAY operand: the live owner words payload (the Safe itself still
resolves at composition time). It composes with the lang array faces
like any nested array face.

### Examples

```evml
load assertions
load safe
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

# Membership, live at judge time
assertions:assert @includes!(@safe:owners!($safe) @me) "signer removed"

# Owner-set size and a specific slot
assertions:assert @len!(@safe:owners!($safe)) >= 3
assertions:assert @at!(@safe:owners!($safe) 0) != 0x0000000000000000000000000000000000000000
```

### See Also

- `assertions:assert`, `@safe:threshold!`, `@safe:isOwner!`, `@safe:modules!`
