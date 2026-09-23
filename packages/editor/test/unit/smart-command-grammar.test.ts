import { expect, it } from "bun:test";
import { createLanguage } from "../../src/editor/evml";
import grammar from "../../src/grammars/evml.tmLanguage.json";

it("highlights ordinary commands and the separate smart block marker", () => {
  const command = new RegExp(grammar.repository.command.match);
  expect(command.exec("batch !(")?.[0]).toBe("batch");
  expect(command.exec("batch (")?.[0]).toBe("batch");
  expect(command.exec("batching (")).toBeNull();
  expect(command.exec("batch! (")).toBeNull();
  const moduleCommand = new RegExp(grammar.repository["module-command"].match);
  expect(moduleCommand.exec("safe:execute $safe !(")?.[1]).toBe("safe:execute");
  const block = grammar.repository.operator.patterns.find(
    (rule) => rule.name === "keyword.operator.smart-block.evml",
  )!;
  expect(new RegExp(block.match).exec("!(")?.[0]).toBe("!");
  expect(new RegExp(block.match).test("! (")).toBe(false);
  const language = createLanguage(["batch"], []);
  const rule = language.tokenizer!.expression.find(
    (r: any) => r.action?.cases?.["@commands"],
  ) as any;
  expect(new RegExp(rule.regex).exec("batch !(")?.[0]).toBe("batch");
  const marker = language.tokenizer!.expression.find(
    (r: any) => r.regex?.source === "!(?=\\()",
  ) as any;
  expect(marker.action.token).toBe("operator");
  expect(marker.regex.exec("!(")?.[0]).toBe("!");
});
