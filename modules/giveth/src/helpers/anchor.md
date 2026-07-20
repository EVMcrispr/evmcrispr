---
title: "@giveth:anchor"
---

Resolve a Giveth project slug to its anchor contract on the current chain — the receiver of recurring donations, streamed with the superfluid module. Anchor contracts exist on Optimism and Base only.

**Returns**: `address`

## Syntax

```evml
@giveth:anchor(slug)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `slug` | `string` | Giveth project slug |

## Examples

```evml
# Stream a monthly recurring donation to a project's anchor contract
load superfluid

switch optimism
superfluid:stream 100e18/mo GIVx to @giveth:anchor(evmcrispr)
```

<!-- HAND-WRITTEN -->

## Recurring donations

Giveth's recurring donations are Superfluid streams paid into the project's
anchor contract, which exists on Optimism and Base for projects that enabled
them. Combine this helper with the superfluid module to open one:

```evml
load giveth
load superfluid

switch optimism
superfluid:stream 100e18/mo GIVx to @giveth:anchor(evmcrispr)
```

Stop it again with `superfluid:stream 0 GIVx to @giveth:anchor(evmcrispr)`.

## See Also

- [giveth:donate](../commands/donate.md)
- [@giveth:project](project.md)
