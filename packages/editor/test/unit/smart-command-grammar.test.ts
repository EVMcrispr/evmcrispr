import { expect, it } from "bun:test";
import { createLanguage } from "../../src/editor/evml";
import grammar from "../../src/grammars/evml.tmLanguage.json";

it("highlights complete bang command names without matching their ordinary prefix", () => {
  const command = new RegExp(grammar.repository.command.match);
  expect(command.exec("batch! (")?.[0]).toBe("batch!");
  expect(command.exec("batch (")?.[0]).toBe("batch");
  expect(command.exec("batching (")).toBeNull();
  const moduleCommand = new RegExp(grammar.repository["module-command"].match);
  expect(moduleCommand.exec("safe:execute! $safe (")?.[1]).toBe(
    "safe:execute!",
  );
  const language = createLanguage(["batch", "batch!"], []);
  const rule = language.tokenizer!.expression.find(
    (r: any) => r.action?.cases?.["@commands"],
  ) as any;
  expect(new RegExp(rule.regex).exec("batch! (")?.[0]).toBe("batch!");
});
