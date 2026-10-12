import { defineEvent } from "@evmcrispr/sdk";
import { guardCheck } from "./_shared";

export default defineEvent({
  name: "changedGuard",
  description: "Safe 1.3.0: the transaction guard after the run.",
  event: "event ChangedGuard(address guard)",
  suggest: guardCheck,
});
