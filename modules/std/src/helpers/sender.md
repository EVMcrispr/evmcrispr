---
title: "@sender"
---

The account the current calls are sent from: the connected wallet (@me), or, inside a block that executes as another account, that account — the Safe in safe:propose and safe:execute, the last forwarder in aragonos forward, the DAO in aragonosx propose and act, the governor's executor (its timelock, else itself) in governor proposals and the timelock in timelock-schedule.

**Returns**: `address`

## Syntax

```evml
@sender
```

## Examples

```evml
# Approve the account the calls come from: your wallet here, the Safe inside safe:propose
exec @token(DAI) "approve(address,uint256)" @sender 100e18
```

<!-- HAND-WRITTEN -->

## See Also
