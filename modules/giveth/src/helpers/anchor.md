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
them. Prefer [giveth:donate-recurring](../commands/donate-recurring.md),
which opens the stream **and** records it in Giveth's database — a bare
superfluid stream to the anchor (as above) moves the funds but never shows
up in project totals or GIVbacks, because nothing indexes the chain on its
own. This helper remains useful for reading the anchor address or for
advanced stream setups (operators, scheduled flows) that
`donate-recurring` doesn't cover.

## See Also

- [giveth:donate-recurring](../commands/donate-recurring.md)
- [giveth:donate](../commands/donate.md)
- [@giveth:project](project.md)
