# aragonos module

Aragon DAO operations: connect to DAOs, manage permissions, install and upgrade apps.

```evml
load aragonos
```

## Commands

| Command | Description |
|---------|-------------|
| [aragonos:act](src/commands/act.md) | Execute an action on a target contract through an agent or vault. |
| [aragonos:connect](src/commands/connect.md) | Connect to an Aragon DAO and execute commands within its context. |
| [aragonos:forward](src/commands/forward.md) | Route actions through a chain of forwarder apps with optional context. |
| [aragonos:grant](src/commands/grant.md) | Grant a permission on a DAO app to an entity, with an optional oracle. |
| [aragonos:install](src/commands/install.md) | Install an Aragon app into the connected DAO. |
| [aragonos:new-dao](src/commands/new-dao.md) | Create a new Aragon DAO and register it with an ENS name. |
| [aragonos:new-token](src/commands/new-token.md) | Create a new MiniMe token with configurable name, symbol, and decimals. |
| [aragonos:revoke](src/commands/revoke.md) | Revoke a permission from an entity on a DAO app, optionally removing the manager. |
| [aragonos:upgrade](src/commands/upgrade.md) | Upgrade an installed Aragon app to a new version. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@aragonos:app](src/helpers/app.md) | `address` | Resolve an app identifier to its proxy address within the connected DAO. |
| [@aragonos:aragonEns](src/helpers/aragonEns.md) | `address` | Resolve an Aragon ENS name to its address. |
| [@aragonos:nextApp](src/helpers/nextApp.md) | `address` | Predict the address of the next app to be installed in the DAO. |

