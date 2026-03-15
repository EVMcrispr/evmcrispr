# aragonos:act

Execute an action on a target contract through an agent or vault.

## Syntax

```
aragonos:act <agent> <target> <signature> [...params]
```

## Arguments

| Name | Type | Required |
|------|------|----------|
| agent | `address` | Yes |
| target | `address` | Yes |
| signature | `write-abi` | Yes |
| ...params | `any` | No |

<!-- HAND-WRITTEN -->









## Examples

```
# Execute a contract call through the DAO agent
act @app(agent) @token(DAI) "transfer(address,uint256)" @me 100e18

# Call with complex parameters
act @app(agent) 0xTarget... "deposit((uint256,int256),uint256[][])" [1 -2] [[2 3] [4 5]]
```

## Notes

- The agent must have the necessary permissions to execute the action
- Parameters are ABI-encoded from the function signature, just like `exec`

## See Also

- [exec](../../std/src/commands/exec.md) — direct contract calls (without DAO agent)
- [forward](forward.md) — route through forwarder apps
