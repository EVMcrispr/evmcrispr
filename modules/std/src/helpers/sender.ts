import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "sender",
  description:
    "The account the current calls are sent from: the connected wallet (@me), or, inside a block that executes as another account, that account — the Safe in safe:propose and safe:execute, the last forwarder in aragonos forward, the DAO in aragonosx propose and act, the governor's executor (its timelock, else itself) in governor proposals and the timelock in timelock-schedule.",
  returnType: "address",
  args: [],
  async run(module) {
    return module.getSender();
  },
});
