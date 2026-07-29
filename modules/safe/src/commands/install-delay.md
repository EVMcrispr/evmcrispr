---
title: "safe:install-delay"
---

Deploy a Zodiac Delay modifier (timelock) owned by the Safe and enable it as a module.

## Syntax

```evml
safe:install-delay <cooldown> [expiration]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `cooldown` | `number` | Time a queued transaction must wait before execution, in time units (e.g. 1d) |
| `[expiration]` | `number` | Time after the cooldown during which the transaction can be executed, in time units (0 = never expires) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--salt` | `number` | Deployment salt nonce (defaults to 0) |

<!-- HAND-WRITTEN -->

## Examples

Install a 24-hour timelock in front of the Safe:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:propose $mySafe (
  safe:install-delay 1d
)
```

The Delay modifier is deployed as a minimal proxy through the Zodiac
ModuleProxyFactory and enabled as a module in the same transaction. Its
address is deterministic and logged during execution.

## See Also
