# ens module

ENS domain operations: renewal and content hash encoding.

```evml
load ens
```

## Commands

| Command | Description |
|---------|-------------|
| [ens:renew](src/commands/renew.md) | Renew ENS domain registrations via bulk renewal. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@ens:contenthash](src/helpers/contenthash.md) | `bytes` | Encode a content hash (ipfs, ipns, skynet) for ENS records. |
| [@ens:ens.avatar](src/helpers/ens.avatar.md) | `string` | Get the avatar URI for an ENS name. |
| [@ens:ens.name](src/helpers/ens.name.md) | `string` | Reverse-resolve an address to its primary ENS name. |
| [@ens:ens.text](src/helpers/ens.text.md) | `string` | Read a text record from an ENS name. |

