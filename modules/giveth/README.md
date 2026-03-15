# giveth module

Giveth protocol operations: donations, GIVbacks distribution, and project resolution.

```
load giveth
```

## Commands

| Command | Description |
|---------|-------------|
| [giveth:donate](src/commands/donate.md) | Send a donation to a Giveth project. |
| [giveth:finalize-givbacks](src/commands/finalize-givbacks.md) | Finalize a GIVbacks distribution by executing batches from IPFS. |
| [giveth:initiate-givbacks](src/commands/initiate-givbacks.md) | Initiate a GIVbacks distribution through DAO governance. |
| [giveth:verify-givbacks](src/commands/verify-givbacks.md) | Verify a GIVbacks vote against its IPFS proposal and vote if valid. |

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@giveth:projectAddr](src/helpers/projectAddr.md) | `address` | Resolve a Giveth project slug to its contract address. |

