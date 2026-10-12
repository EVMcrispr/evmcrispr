import { defineEvent } from "@evmcrispr/sdk";
import { ownerCheck } from "./_shared";

export default defineEvent({
  name: "removedOwnerIndexed",
  description: "Safe 1.4.1 and later: a removed owner is no longer an owner.",
  event: "event RemovedOwner(address indexed owner)",
  suggest: ownerCheck(false),
});
