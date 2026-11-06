import { describe, expect, it } from "bun:test";
import { PassThrough } from "node:stream";
import { makeConfirm } from "../src/lib/confirm";

function sink() {
  const output = new PassThrough();
  let text = "";
  output.on("data", (chunk) => {
    text += chunk.toString();
  });
  return { output, text: () => text };
}

describe("makeConfirm", () => {
  it("with --yes prints the summary and confirms without a prompt", async () => {
    const out = sink();
    const confirm = makeConfirm({
      yes: true,
      tty: false,
      input: new PassThrough(),
      output: out.output,
    });
    expect(await confirm("Sign a transaction on Ethereum")).toBe(true);
    expect(out.text()).toContain("Sign a transaction on Ethereum");
    expect(out.text()).not.toContain("[y/N]");
  });

  it("refuses without a terminal and without --yes", async () => {
    const out = sink();
    const confirm = makeConfirm({
      yes: false,
      tty: false,
      input: new PassThrough(),
      output: out.output,
    });
    await expect(confirm("Sign a transaction")).rejects.toThrow(
      "Refusing to sign without confirmation: run in a terminal or pass --yes",
    );
  });

  it("in a terminal asks y/N and confirms only on y or yes", async () => {
    for (const [answer, expected] of [
      ["y", true],
      ["yes", true],
      ["Y", true],
      ["n", false],
      ["", false],
      ["sure", false],
    ] as const) {
      const out = sink();
      const input = new PassThrough();
      const confirm = makeConfirm({
        yes: false,
        tty: true,
        input,
        output: out.output,
      });
      const answered = confirm("Sign a transaction on Ethereum");
      input.write(`${answer}\n`);
      expect(await answered).toBe(expected);
      expect(out.text()).toContain("Sign a transaction on Ethereum");
      expect(out.text()).toContain("Sign? [y/N] ");
    }
  });
});
