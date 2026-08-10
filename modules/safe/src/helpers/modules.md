---
title: "@safe:modules"
---

Enabled module addresses of a Safe.

**On-chain (`@safe:modules!`)**: Reads one `getModulesPaginated` page, so a Safe with more modules than `pageSize` (default 100) is truncated.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@safe:modules(safe? pageSize?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[safe]` | `address` | Safe address (defaults to the context Safe or connected account) |
| `[pageSize]` | `number` | Page size of the single `getModulesPaginated` page the on-chain face reads (default 100) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load safe

set $modules @safe:modules(0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67)
print $modules
```

## On-chain face (@modules!)

ONE `getModulesPaginated(0x1, pageSize)` page read on-chain at
assertion time, navigated to its array component as an ARRAY operand
composable with the lang array faces. The sentinel `0x1` starts the
module linked list; `pageSize` is a composition-time argument
defaulting to 100.

THE PAGINATION CAP: the face reads a single page, so a Safe with more
enabled modules than `pageSize` is truncated to the first page (the
off-chain @safe:modules follows `next` across pages instead). Raise
`pageSize` when a Safe could legitimately carry more modules.

### Examples

```evml
load assertions
load safe
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

# No module enabled at all
assertions:assert @len!(@safe:modules!($safe)) == 0 "unexpected module"

# A specific module stays enabled (default page size 100)
assertions:assert @includes!(@safe:modules!($safe) 0x9641d764fc13c8B624c04430C7356C1C7C8102e2)

# A wider page for a module-heavy Safe
assertions:assert @len!(@safe:modules!($safe 500)) == 12
```

### See Also

- `assertions:assert`, `@safe:owners!`, `@safe:guard!`
