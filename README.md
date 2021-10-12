# EVMcrispr Terminal <img align="right" src="https://github.com/BlossomLabs/evmcrispr-terminal/blob/master/public/logo192.png" height="80px" />

With the evm-crispr terminal you can create complex votes that can be executed by an AragonOS DAO all at once.

## Available commands:
```
connect <dao> <...path>
install <repo> [...initParams]
grant <entity> <app> <role> [permissionManager]
revoke <entity> <app> <role>
exec <app> <method> [...params]
act <agent> <targetAddr> <method> [...params]
```
## Example (unwrap WETH):
```
connect 1hive token-manager voting
install agent:new-agent
grant voting agent:new-agent TRANSFER_ROLE voting
exec vault transfer -token:WETH agent:new-agent 100e18
act agent:new-agent 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d withdraw(uint256) 100e18
exec agent:new-agent transfer -token:ETH vault 100e18
```
