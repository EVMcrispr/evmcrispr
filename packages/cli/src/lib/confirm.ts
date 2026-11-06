import { createInterface } from "node:readline";

/** Shows what is about to be signed and resolves true only when the user
 *  (or `--yes`) agrees. */
export type Confirm = (summary: string) => Promise<boolean>;

export const NO_CONFIRMATION =
  "Refusing to sign without confirmation: run in a terminal or pass --yes";

/**
 * With `yes`, every signature is shown and accepted. Without it, a
 * terminal is asked y/N for each one, and without a terminal nothing is
 * signed.
 */
export function makeConfirm({
  yes,
  tty,
  input,
  output,
}: {
  yes: boolean;
  tty: boolean;
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}): Confirm {
  return async (summary) => {
    if (yes) {
      output.write(`${summary}\n`);
      return true;
    }
    if (!tty) throw new Error(NO_CONFIRMATION);
    output.write(`${summary}\n`);
    const rl = createInterface({ input, output, terminal: false });
    try {
      const answer = await new Promise<string>((resolve) => {
        rl.question("Sign? [y/N] ", resolve);
        // Input that ends without an answer is a no.
        rl.once("close", () => resolve(""));
      });
      return ["y", "yes"].includes(answer.trim().toLowerCase());
    } finally {
      rl.close();
    }
  };
}
