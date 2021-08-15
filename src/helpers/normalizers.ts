import { utils } from "ethers";
import { Action, Function, RawAction } from "../types";

export const flatElements = (elements: any[]) => {
  return elements.reduce((flattenedElements, element) => {
    if (Array.isArray(element)) {
      return [...flattenedElements, ...element];
    }
    return [...flattenedElements, element];
  }, []);
};

export const normalizeRole = (role: string): string => {
  return role.startsWith("0x") && role.length === 64 ? role : utils.id(role);
};

export const normalizeActions = async (actions: Function<RawAction>[]): Promise<Action[]> => {
  const normalizedActions: RawAction[] = [];

  for (const action of actions) {
    normalizedActions.push(await action());
  }

  return flatElements(normalizedActions);
};
