---
title: "@includes"
---

Check whether an array contains an element.

**Returns**: `bool`

## Syntax

```evml
@includes(value, item)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Input value |
| `item` | `any` | Element to search for |

## Examples

```evml
# Check if array contains element
set $arr [1 2 3]
print @includes($arr 2)

# Check for missing element
set $arr [1 2 3]
print @includes($arr 99)
```

<!-- HAND-WRITTEN -->

## See Also

- [@find](find.md) — find the first matching element
- [@filter](filter.md) — keep all matching elements
