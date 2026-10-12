import { defineEvent } from "@evmcrispr/sdk";
import { moduleCheck } from "./_shared";

export default defineEvent({
  name: "enabledModule",
  description: "Safe 1.3.0: an enabled module is enabled.",
  event: "event EnabledModule(address module)",
  suggest: moduleCheck(true),
});
