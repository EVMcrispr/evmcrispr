import { describe, it } from "bun:test";
import { defineModule } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { EvmlScript } from "../../../src/evml/script";
import { createEvml } from "../../../src/evml/tag";

const StubModule = defineModule("stub", {});

describe("evml > tag", () => {
  it("builds EvmlScript from templates with serialized interpolations", () => {
    const evml = createEvml();
    const addr = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3";
    const script = evml`set $target ${addr}
set $amount ${100n}
set $label ${"it's fine"}`;
    expect(script).to.be.instanceOf(EvmlScript);
    expect(script.source).to.equal(
      `set $target ${addr}\nset $amount 100\nset $label 'it\\'s fine'`,
    );
    expect(script.diagnostics).to.eql([]);
    expect(script.ast.body).to.have.lengthOf(3);
  });

  it("composes nested fragments", () => {
    const evml = createEvml();
    const inner = evml`set $x 1`;
    const outer = evml`${inner}
set $y 2`;
    expect(outer.source).to.equal("set $x 1\nset $y 2");
  });

  it("registers eager module classes via their moduleName static", () => {
    const evml = createEvml();
    evml.use(StubModule);
    expect(evml.registry.has("stub")).to.be.true;
  });

  it("registers lazy loader entries", () => {
    const evml = createEvml();
    evml.use({
      name: "lazystub",
      load: async () => ({ default: StubModule }),
      description: "a stub",
    });
    expect(evml.registry.has("lazystub")).to.be.true;
    expect(evml.registry.description("lazystub")).to.equal("a stub");
  });

  it("rejects module classes without a moduleName", () => {
    const evml = createEvml();
    class Bare {}
    expect(() => evml.use(Bare as any)).to.throw(/moduleName/);
  });

  it("with() derives config but shares the registry", () => {
    const evml = createEvml({ chainId: 1 });
    const derived = evml.with({ chainId: 100 });
    derived.use(StubModule);
    expect(evml.registry.has("stub")).to.be.true;
    expect(derived.config.chainId).to.equal(100);
    expect(evml.config.chainId).to.equal(1);
  });

  it("createEvml() isolates registries", () => {
    const a = createEvml();
    const b = createEvml();
    a.use(StubModule);
    expect(a.registry.has("stub")).to.be.true;
    expect(b.registry.has("stub")).to.be.false;
  });

  it("script() wraps plain strings and raw() escapes serialization", () => {
    const evml = createEvml();
    expect(evml.script("set $x 1").source).to.equal("set $x 1");
    const script = evml`print ${evml.raw("@token(DAI)")}`;
    expect(script.source).to.equal("print @token(DAI)");
  });
});
