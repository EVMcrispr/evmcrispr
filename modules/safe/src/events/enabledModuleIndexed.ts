import { defineEvent } from "@evmcrispr/sdk";
import { moduleCheck } from "./_shared";

export default defineEvent({
  name: "enabledModuleIndexed",
  description: "Safe 1.4.1 and later: an enabled module is enabled.",
  event: "event EnabledModule(address indexed module)",
  suggest: moduleCheck(true),
});
