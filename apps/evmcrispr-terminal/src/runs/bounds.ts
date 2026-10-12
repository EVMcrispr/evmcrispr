// A run's record is written to storage as the run goes, and a script can
// print in a loop: everything a record keeps is bounded where it grows.
// The console bounds itself (`reduceConsole`); these are the other two
// parts that grow. The bounds are those an export may hold, so a run made
// here can always be exported.
import { IMPORT_LIMITS } from "@evmcrispr/space";

export const OUTPUT_CUT = "[output cut: the run printed more than is kept]\n";

/** `output` with one more line of it, while it fits. Past the limit
 *  nothing more is kept, and the output ends saying so. */
export function appendOutput(output: string, text: string): string {
  if (output.endsWith(OUTPUT_CUT)) return output;
  const next = `${output}${text}\n`;
  return next.length + OUTPUT_CUT.length <= IMPORT_LIMITS.output
    ? next
    : `${output}${OUTPUT_CUT}`;
}

const MAX_ERRORS = 100;

export function boundErrors(errors: string[]): string[] {
  return errors
    .slice(0, MAX_ERRORS)
    .map((error) => error.slice(0, IMPORT_LIMITS.error));
}
