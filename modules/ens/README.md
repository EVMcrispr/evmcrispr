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
| [@ens:contenthash](src/helpers/contenthash.md) | `bytes32` | Encode a content hash (ipfs, ipns, skynet) for ENS records. |

