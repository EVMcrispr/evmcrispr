---
title: "aragonos:forward"
---

Route actions through a chain of forwarder apps with optional context.

Smart blocks: cannot be nested. This command opens a separate atomic execution context; nested atomic blocks are unsupported.

## Syntax

```evml
aragonos:forward [...forwarders] <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `[...forwarders]` | `app` | Build time | Forwarding path through apps |
| `block` | `block` | Build time | Commands to forward |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--context` | `string` | Build time | Context string attached to the forwarding |
| `--check-forwarder` | `bool` | Build time | Verify forwarder can forward before submitting |

## Examples

```evml
# Forward through voting to modify permissions
aragonos:connect 0x1fc7e8d8e4bbbef77a4d035aec189373b52125a8 (
  aragonos:forward @aragonos:app(disputable-voting.open) (
    aragonos:grant PAUSE_CONTRACT_ROLE on @aragonos:app(disputable-conviction-voting.open) to @aragonos:app(disputable-voting.open) @aragonos:app(disputable-voting.open)
  ) --context "Modify permissions"
)
```

<!-- HAND-WRITTEN -->

## Notes

- Multiple forwarders create a chain: the action is forwarded through each in order
- `--context` attaches a human-readable description to the forwarded action
- `--check-forwarder` validates that each app can actually forward

## See Also

- [grant](grant.md) / [revoke](revoke.md) — permission management
- [connect](connect.md) — establish DAO context
