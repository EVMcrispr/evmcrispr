import { describe, expect, it } from "bun:test";
import { createEvml } from "../../../src";

const target = "0x1111111111111111111111111111111111111111";
const diagnostics = async (script: string) =>
  (await createEvml().workspace().getFullDiagnostics(script)).filter(
    (d) => d.source === "semantic",
  );
describe("smart batch editor diagnostics", () => {
  it("accepts captured arguments, bangs, and compile-time expansion", async () => {
    const ds = await diagnostics(
      `batch! (\ndef relay "$x: number" (\nexec ${target} "g(uint256)" $x\n)\nexec ${target} "f() returns (uint256)" -> [$amount]\nloop $i of [1 2] (\nrelay $amount\n)\nexec ${target} "g(uint256)" @calc!($amount + 1)\n)`,
    );
    expect(ds).toEqual([]);
  });
  it("rejects runtime values in build-time fields and scopes captures", async () => {
    const ds = await diagnostics(
      `batch! (\nexec ${target} "f() returns (uint256)" -> [$amount]\nset $copy $amount\n)\nexec ${target} "g(uint256)" $amount`,
    );
    expect(ds.some((d) => d.code === "runtime-build-time-field")).toBe(true);
    expect(ds.some((d) => d.code === "undefined-variable")).toBe(true);
  });
  it("rejects capture outside a smart block and ordinary reads inside it", async () => {
    expect(
      (
        await diagnostics(`exec ${target} "f() returns (uint256)" -> [$x]`)
      ).some((d) => d.code === "return-capture-context"),
    ).toBe(true);
    expect(
      (
        await diagnostics(
          `batch! (\nexec ${target} "g(uint256)" @balance(ETH @me)\n)`,
        )
      ).some((d) => d.code === "not-batchable"),
    ).toBe(true);
  });
  it("rejects required error captures inside a smart batch but not optional ones", async () => {
    const required = (
      await diagnostics(`batch! (\nexec ${target} "x()" -!> Failure()\n)`)
    ).filter((d) => d.code === "smart-batch-required-capture");
    expect(required).toHaveLength(1);
    expect(required[0]).toMatchObject({ severity: "error" });
    expect(required[0].message).toContain("assert @reverts!(");
    expect(
      (await diagnostics(`batch! (\nexec ${target} "x()" -?!> $e\n)`)).some(
        (d) => d.code === "smart-batch-required-capture",
      ),
    ).toBe(false);
  });
});
