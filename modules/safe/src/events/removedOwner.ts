import { defineEvent } from "@evmcrispr/sdk";
import { ownerCheck } from "./_shared";

export default defineEvent({
  name: "removedOwner",
  description: "Safe 1.3.0: a removed owner is no longer an owner.",
  event: "event RemovedOwner(address owner)",
  suggest: ownerCheck(false),
});
