# EVMcrispr Terminal <img align="right" src="https://github.com/BlossomLabs/evmcrispr-terminal/blob/master/public/logo192.png" height="80px" />

With the EVMcrispr terminal you can create complex votes that can be executed by an AragonOS DAO all at once.

## Available commands:
```
connect <dao> <...path> [@context:https://yoursite.com]
install <repo> [...initParams]
grant <entity> <app> <role> [permissionManager]
revoke <entity> <app> <role>
exec <app> <methodName> [...params]
act <agent> <targetAddr> <methodSignature> [...params]
```
## Example (unwrap wxDAI):
```
connect 1hive token-manager voting
install agent:new-agent
grant voting agent:new-agent TRANSFER_ROLE voting
exec vault transfer @token(WXDAI) agent:new-agent 100e18
act agent:new-agent @token(WXDAI) withdraw(uint256) 100e18
exec agent:new-agent transfer XDAI vault 100e18
```

## Sponsors
<a href="https://giveth.io/">
  <img src="https://miro.medium.com/max/500/1*vGFPM8KssUeiBm1QGIo5aQ.jpeg" height=100>
</a>