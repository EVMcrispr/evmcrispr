# aragonos:forward

Route actions through a chain of forwarder apps with optional context.

## Syntax

```
aragonos:forward [...forwarders] <block>
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| ...forwarders | `app` | No |
| block | `block` | Yes |

## Options

| Name | Type |
|------|------|
| --context | `string` |
| --check-forwarder | `bool` |

<!-- HAND-WRITTEN -->









## Examples

```
# Forward through voting to execute privileged actions
forward @app(voting) (
  grant @app(voting) @app(conviction-voting) PAUSE_CONTRACT_ROLE @app(voting)
  revoke @ANY_ENTITY @app(conviction-voting) CREATE_PROPOSALS_ROLE true
) --context "Modify conviction voting permissions"
```

## Notes

- Multiple forwarders create a chain: the action is forwarded through each in order
- `--context` attaches a human-readable description to the forwarded action
- `--check-forwarder` validates that each app can actually forward

## See Also

- [grant](grant.md) / [revoke](revoke.md) — permission management
- [connect](connect.md) — establish DAO context
