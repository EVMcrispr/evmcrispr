import { defineEvent } from "@evmcrispr/sdk";
import { ownerCheck } from "./_shared";

export default defineEvent({
  name: "addedOwnerIndexed",
  description: "Safe 1.4.1 and later: an added owner is an owner.",
  event: "event AddedOwner(address indexed owner)",
  suggest: ownerCheck(true),
});
