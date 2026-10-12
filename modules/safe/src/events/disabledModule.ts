import { defineEvent } from "@evmcrispr/sdk";
import { moduleCheck } from "./_shared";

export default defineEvent({
  name: "disabledModule",
  description: "Safe 1.3.0: a disabled module is disabled.",
  event: "event DisabledModule(address module)",
  suggest: moduleCheck(false),
});
