import { createContext, type ReactNode, useContext } from "react";

const HeaderAction = createContext<ReactNode>(null);

/** Gives the Space tab one more action in its header, whichever of its
 *  views is on screen: on a phone, the way back to the chat. */
export const HeaderActionProvider = HeaderAction.Provider;

export function useHeaderAction(): ReactNode {
  return useContext(HeaderAction);
}

const ScriptLink = createContext<(() => void) | null>(null);

/** Where the script is not on screen beside the timeline (a phone), the
 *  timeline leads to it: this opens it. */
export const ScriptLinkProvider = ScriptLink.Provider;

export function useScriptLink(): (() => void) | null {
  return useContext(ScriptLink);
}
