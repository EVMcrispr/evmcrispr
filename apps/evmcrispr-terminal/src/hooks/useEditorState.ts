import type {
  AsExpressionNode,
  CommandExpressionNode,
  EvmlAST,
} from "@evmcrispr/core";
import { BindingsManager, NodeType, parseScript } from "@evmcrispr/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { runEagerExecutions } from "../components/editor/autocompletion";
import { getModulesKeywords } from "../components/editor/evml";
import { DEFAULT_MODULE_BINDING } from "../utils";
import { useDebounce } from "./useDebounce";

type ModuleInfo = { name: string; alias?: string };

function extractModuleNames(loadNodes: CommandExpressionNode[]): ModuleInfo[] {
  return loadNodes.map((c) => {
    const nameNode = c.args[0];
    if (nameNode.type === NodeType.AsExpression) {
      return {
        name: (nameNode as AsExpressionNode).left.value,
        alias: (nameNode as AsExpressionNode).right.value,
      };
    }
    return { name: nameNode.value };
  });
}

export function useEditorState(script: string) {
  const debouncedScript = useDebounce(script, 300);
  const bindingsCacheRef = useRef(
    new BindingsManager([DEFAULT_MODULE_BINDING]),
  );
  const prevModulesKeyRef = useRef("");

  // Derive AST from debounced script
  const ast = useMemo<EvmlAST | undefined>(() => {
    const { ast } = parseScript(debouncedScript);
    return ast;
  }, [debouncedScript]);

  // Track module keywords — updated via effect when load commands change
  const [keywords, setKeywords] = useState({
    commandKeywords: [] as string[],
    helperKeywords: [] as string[],
  });

  useEffect(() => {
    if (!ast) {
      return;
    }

    const scriptLines = debouncedScript.split("\n");
    const commandNodes = ast.getCommandsUntilLine(scriptLines.length, [
      "load",
      "set",
    ]);
    const loadNodes = commandNodes.filter(
      (c: CommandExpressionNode) => c.name === "load",
    );
    const moduleNames = extractModuleNames(loadNodes);

    const modulesKey = JSON.stringify(moduleNames);
    if (modulesKey === prevModulesKeyRef.current) {
      return;
    }

    const updateModules = async () => {
      if (loadNodes.length) {
        await runEagerExecutions(
          loadNodes,
          bindingsCacheRef.current,
          bindingsCacheRef.current,
          {} as any,
          {} as any,
        );
      }
      prevModulesKeyRef.current = modulesKey;
      setKeywords(getModulesKeywords(moduleNames, bindingsCacheRef.current));
    };

    updateModules();
  }, [ast, debouncedScript]);

  return {
    ast,
    bindingsCache: bindingsCacheRef.current,
    commandKeywords: keywords.commandKeywords,
    helperKeywords: keywords.helperKeywords,
  };
}
