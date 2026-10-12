import { defineEvent } from "@evmcrispr/sdk";
import { moduleCheck } from "./_shared";

export default defineEvent({
  name: "disabledModuleIndexed",
  description: "Safe 1.4.1 and later: a disabled module is disabled.",
  event: "event DisabledModule(address indexed module)",
  suggest: moduleCheck(false),
});
