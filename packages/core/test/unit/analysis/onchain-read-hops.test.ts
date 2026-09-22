import { describe, expect, it } from "bun:test";
import { createEvml } from "../../../src";

const target = "0x1111111111111111111111111111111111111111";
const diagnostics = async (script: string) =>
  (await createEvml().workspace().getFullDiagnostics(script)).filter(
    (d) => d.source === "semantic",
  );
const codes = async (script: string) =>
  (await diagnostics(script)).map((d) => d.code);

describe("on-chain expressions require ::! read hops", () => {
  it("flags a plain :: call as an assert side", async () => {
    const ds = await diagnostics(`assert ${target}::{value()(uint256)} == 1`);
    expect(ds.map((d) => d.code)).toEqual(["build-time-call-onchain"]);
    expect(ds[0].message).toContain("::!");
  });
  it("accepts a ::! read hop as an assert side", async () => {
    expect(await codes(`assert ${target}::!{value()(uint256)} == 1`)).toEqual(
      [],
    );
  });
  it("flags a plain :: call nested in an on-chain helper", async () => {
    expect(
      await codes(`assert @calc!(${target}::{value()(uint256)} + 1) == 1`),
    ).toEqual(["build-time-call-onchain"]);
    expect(
      await codes(
        `assert @bool!((${target}::{a()(uint256)} > 0) or (${target}::!{b()(bool)} == false))`,
      ),
    ).toEqual(["build-time-call-onchain"]);
  });
  it("flags a plain :: call as a ::! hop argument", async () => {
    expect(
      await codes(
        `assert ${target}::!{f(address)(uint256) ${target}::{owner()(address)}} == 1`,
      ),
    ).toEqual(["build-time-call-onchain"]);
  });
  it("leaves build-time :: calls alone", async () => {
    expect(await codes(`set $x ${target}::{value()(uint256)}`)).toEqual([]);
    expect(
      await codes(`set $n @calc(${target}::{value()(uint256)} + 1)`),
    ).toEqual([]);
    expect(
      await codes(`print @reverts(${target}::{value()(uint256)})`),
    ).toEqual([]);
  });
});
