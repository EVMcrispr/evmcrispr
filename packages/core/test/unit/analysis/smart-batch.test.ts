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
      `batch! (\nexec ${target} "f() returns (uint256)" -> [$amount]\nset $copy $amount\nprint $copy\n)\nexec ${target} "g(uint256)" $amount`,
    );
    expect(ds.some((d) => d.code === "runtime-build-time-field")).toBe(true);
    expect(ds.some((d) => d.code === "undefined-variable")).toBe(true);
  });
  it("accepts live conditions, aliases, reassignment and optional loop variables", async () => {
    expect(
      await diagnostics(`batch! (
set $amount ${target}::!{f()(uint256)}
set $amount @calc!($amount + 1)
if @bool!($amount > 0) (
exec ${target} "g(uint256)" $amount
)
loop until @bool!(${target}::!{f()(uint256)} > 0) --max-iterations 2 (
exec ${target} "g(uint256)" $amount
)
loop $x of [$amount] (
exec ${target} "g(uint256)" $x
)
)`),
    ).toEqual([]);
    const ds = await diagnostics(`batch! (
if @bool!(${target}::!{f()(uint256)} > 0) (
set $branch 7
)
exec ${target} "g(uint256)" $branch
)`);
    expect(ds.some((d) => d.code === "undefined-variable")).toBe(true);
  });
  it("accepts loop exits chosen by a runtime condition", async () => {
    expect(
      await diagnostics(`batch! (
loop $i of [1 2] (
if @bool!(${target}::!{f()(uint256)} > 0) (
loop continue
) (
loop break
)
)
)`),
    ).toEqual([]);
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
  it("rejects revert captures inside a smart batch, required or optional", async () => {
    const required = (
      await diagnostics(`batch! (\nexec ${target} "x()" -!> Failure()\n)`)
    ).filter((d) => d.code === "revert-capture-in-smart-batch");
    expect(required).toHaveLength(1);
    expect(required[0]).toMatchObject({ severity: "error" });
    expect(required[0].message).toContain("assert @reverts!(");

    const optional = (
      await diagnostics(`batch! (\nexec ${target} "x()" -?!> $e\n)`)
    ).filter((d) => d.code === "revert-capture-in-smart-batch");
    expect(optional).toHaveLength(1);
    expect(optional[0]).toMatchObject({ severity: "error" });
    expect(optional[0].message).toContain("if @reverts!(");
  });
  it("accepts refusal captures inside a smart batch", async () => {
    expect(
      await diagnostics(
        `batch! (\nexec ${target} "x()" -/> Failure()\nexec ${target} "y()" -?/> $e\n)`,
      ),
    ).toEqual([]);
  });
});
