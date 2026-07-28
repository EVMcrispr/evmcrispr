# aragonosx module

Interact with Aragon OSx DAOs: connect to a DAO, manage permissions, route actions through governance plugins (Admin, Multisig, Token Voting, Staged Proposal Processor) as proposals, install, upgrade and uninstall plugins via the Plugin Setup Processor, and create new DAOs.

**Experimental** — requires `VITE_PUBLIC_EXPERIMENTAL=true`.

```evml
load aragonosx
```

## Configuration variables

Config variables are set with `set` (fully qualified, including the module prefix) and are only readable by their own module and the user script.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `$aragonosx:daoFactory` | `address` | — | Override the OSx DAOFactory address. |
| `$aragonosx:daoRegistry` | `address` | — | Override the OSx DAORegistry address. |
| `$aragonosx:pluginSetupProcessor` | `address` | — | Override the OSx PluginSetupProcessor address. |
| `$aragonosx:pluginSetupProcessorBlock` | `number` | — | Deployment block of the PluginSetupProcessor, used to bound event scans. |
| `$aragonosx:pluginRepoFactory` | `address` | — | Override the OSx PluginRepoFactory address. |
| `$aragonosx:pluginRepoRegistry` | `address` | — | Override the OSx PluginRepoRegistry address. |
| `$aragonosx:managementDao` | `address` | — | Override the OSx management DAO address. |
| `$aragonosx:daoEnsDomain` | `string` | — | Override the ENS domain DAO names are registered under. |
| `$aragonosx:pluginEnsDomain` | `string` | — | Override the ENS domain plugin repos are registered under. |
| `$aragonosx:subgraphUrl` | `string` | — | Override the OSx subgraph endpoint for the current chain. |
| `$aragonosx:adminRepo` | `address` | — | Override the admin plugin repo address. |
| `$aragonosx:multisigRepo` | `address` | — | Override the multisig plugin repo address. |
| `$aragonosx:tokenVotingRepo` | `address` | — | Override the token-voting plugin repo address. |
| `$aragonosx:stagedProposalProcessorRepo` | `address` | — | Override the staged-proposal-processor plugin repo address. |

## Commands

| Command | Description |
|---------|-------------|
| [aragonosx:act](src/commands/act.md) | Execute actions directly through the DAO (the caller needs EXECUTE_PERMISSION on it). |
| [aragonosx:approve](src/commands/approve.md) | Approve a multisig proposal. |
| [aragonosx:connect](src/commands/connect.md) | Connect to an Aragon OSx DAO and execute commands within its context. |
| [aragonosx:execute-proposal](src/commands/execute-proposal.md) | Execute a passed proposal on a governance plugin. |
| [aragonosx:grant](src/commands/grant.md) | Grant a permission on the DAO or one of its plugins to an entity, optionally gated by a condition contract. |
| [aragonosx:install](src/commands/install.md) | Install a plugin into the connected DAO via the Plugin Setup Processor. |
| [aragonosx:new-dao](src/commands/new-dao.md) | Create a new Aragon OSx DAO with an initial governance plugin. |
| [aragonosx:propose](src/commands/propose.md) | Wrap actions into a proposal on one of the DAO's governance plugins. |
| [aragonosx:revoke](src/commands/revoke.md) | Revoke a permission on the DAO or one of its plugins from an entity. |
| [aragonosx:uninstall](src/commands/uninstall.md) | Uninstall a plugin from the connected DAO via the Plugin Setup Processor. |
| [aragonosx:upgrade](src/commands/upgrade.md) | Update an installed plugin to a newer build via the Plugin Setup Processor. |
| [aragonosx:vote](src/commands/vote.md) | Vote on a token-voting proposal. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@aragonosx:dao](src/helpers/dao.md) | `address` | Resolve the connected DAO to its address. |
| [@aragonosx:permission](src/helpers/permission.md) | `bytes32` | Compute the bytes32 id of a permission name (keccak256 of e.g. EXECUTE_PERMISSION). |
| [@aragonosx:plugin](src/helpers/plugin.md) | `address` | Resolve a plugin repo subdomain to its address within the connected DAO. |
| [@aragonosx:repo](src/helpers/repo.md) | `address` | Resolve a plugin repo subdomain to its PluginRepo address. |

