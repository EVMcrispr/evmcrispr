import { defineErrors } from "../../../src/utils/declaredErrors";

/** A declaration block shared between a command and a helper, the way a
 *  module spreads one into several definitions. */
export const VENUE_ERRORS = defineErrors({
  NoQuote: { description: "The venue declined the order" },
});
