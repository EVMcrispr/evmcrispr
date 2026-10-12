import "../setup";
import { describe, expect, it } from "bun:test";
import { evml } from "@evmcrispr/test-utils/evml";

const WHO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const diagnostics = async (script: string) =>
  (await evml.script(script).validate()).diagnostics;

describe("Sim > analysis of the acting account", () => {
  it("warns on sim:fork --from and says to write --as", async () => {
    const found = (
      await diagnostics(`load sim\nsim:fork --from ${WHO} (\n  print 1\n)`)
    ).find((d) => d.code === "deprecated-option");
    expect(found?.severity).toBe("warning");
    expect(found?.message).toBe(
      '--from is deprecated for "sim:fork". Write `sim:fork --as <address>` instead.',
    );
  });

  it("accepts sim:fork --as and --on", async () => {
    expect(
      await diagnostics(
        `load sim\nsim:fork --as ${WHO} --on gnosis --block-number 123 (\n  print 1\n)`,
      ),
    ).toEqual([]);
  });

  it("accepts a bare switch anywhere inside a fork", async () => {
    expect(
      await diagnostics(
        `load sim\nsim:fork (\n  switch gnosis\n  if true (\n    switch --as ${WHO}\n  )\n)`,
      ),
    ).toEqual([]);
  });
});
