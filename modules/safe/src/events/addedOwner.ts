import { defineEvent } from "@evmcrispr/sdk";
import { ownerCheck } from "./_shared";

export default defineEvent({
  name: "addedOwner",
  description: "Safe 1.3.0: an added owner is an owner.",
  event: "event AddedOwner(address owner)",
  suggest: ownerCheck(true),
});
