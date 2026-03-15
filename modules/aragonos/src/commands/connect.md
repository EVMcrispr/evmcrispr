# aragonos:connect

Connect to an Aragon DAO and execute commands within its context.

## Syntax

```
aragonos:connect <daoName> <block>
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| daoName | `dao` | Yes |
| block | `block` | Yes |

<!-- HAND-WRITTEN -->









## Examples

```
# Connect to a DAO by ENS name
load aragonos
aragonos:connect my-dao.aragonid.eth (
  aragonos:grant @me @app(voting) CREATE_VOTES_ROLE
)

# Connect by address
aragonos:connect 0xb1f5...a84e (
  aragonos:grant @me @app(agent) TRANSFER_ROLE
)

# Nested DAO connections
aragonos:connect 0xDAO1... (
  connect 0xDAO2... (
    grant @app(voting) @app(_0xDAO1...:agent) TRANSFER_ROLE
  )
)
```

## Notes

- Inside a `connect` block, commands like `grant`, `install`, `revoke` can be used without the `aragonos:` prefix
- The `@app()` helper resolves app identifiers within the connected DAO context
- Nested `connect` blocks allow cross-DAO operations

## See Also

- [grant](grant.md) — manage permissions
- [install](install.md) — install apps
- [@app](../helpers/app.md) — resolve app addresses
