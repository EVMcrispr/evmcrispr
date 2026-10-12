import { defineEvent } from "@evmcrispr/sdk";
import { guardCheck } from "./_shared";

export default defineEvent({
  name: "changedGuardIndexed",
  description: "Safe 1.4.1 and later: the transaction guard after the run.",
  event: "event ChangedGuard(address indexed guard)",
  suggest: guardCheck,
});
