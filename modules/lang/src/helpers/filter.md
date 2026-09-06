---
title: "@lang:filter"
---

Keep elements of an array for which a helper returns truthy.

**On-chain (`@lang:filter!`)**: Uses a named boolean predicate. Callbacks may compose helpers and ABI calls over typed word or multiword values.

**Returns**: `array`

## Syntax

```evml
@lang:filter(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

<!-- HAND-WRITTEN -->

## See Also

- [@find](find.md) — return the first match
- [@all](all.md) — check if all elements match
- [@any](any.md) — check if any element matches
- [@map](map.md) — transform each element

## On-chain face (@filter!)

Keep values for which a named boolean callback returns true. Typed multiword values are supported, and the callback may compose helpers and ABI calls. The result retains the input element type and order.
