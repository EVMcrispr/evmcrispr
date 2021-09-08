import { utils } from "ethers";
import { ErrorInvalid } from "../errors";
import { Action, ActionFunction, RawAction } from "../types";

export const flatElements = (elements: any[]) => {
  return elements.reduce((flattenedElements, element) => {
    if (Array.isArray(element)) {
      return [...flattenedElements, ...element];
    }
    return [...flattenedElements, element];
  }, []);
};

export const normalizeRole = (role: string): string => {
  if (role.startsWith("0x")) {
    if (role.length !== 66) {
      throw new ErrorInvalid("Invalid role provided", { name: "ErrorInvalidRole" });
    }
    return role;
  }

  return utils.id(role);
};

export const normalizeActions = async (actions: ActionFunction[]): Promise<Action[]> => {
  const normalizedActions: RawAction[] = [];

  for (const action of actions) {
    normalizedActions.push(await action());
  }

  return flatElements(normalizedActions);
};
