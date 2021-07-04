import { utils } from "ethers";
import { Action } from "../types";

const flatElements = (elements) => {
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

export const normalizeActions = (actions: (Action | Action[] | Promise<Action>)[]): Promise<Action[]> => {
  return Promise.all(flatElements(actions));
};
