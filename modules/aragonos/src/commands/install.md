# aragonos:install

Install an Aragon app into the connected DAO.

## Syntax

```
aragonos:install <variable> <identifier> [...params]
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| variable | `variable` | Yes |
| identifier | `repo` | Yes |
| ...params | `any` | No |

## Options

| Name | Type |
|------|------|
| --dao | `any` |
| --version | `any` |

<!-- HAND-WRITTEN -->









## Examples

```
# Install an agent app
install $agent agent:new

# Install with a specific version
install $vault vault:new --version 2.0.0

# Install and use the resulting address
install $tm token-manager:new @token(ANT) false 1e18
grant @me $tm MINT_ROLE
```

## See Also

- [upgrade](upgrade.md) — upgrade an installed app
- [connect](connect.md) — establish DAO context first
