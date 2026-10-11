import { createContext, useContext } from "react";

const ToChat = createContext<(() => void) | null>(null);

/** Where the chat is not on screen beside the Space tab (a phone), both
 *  of the tab's views lead back to it: this goes there. Its presence is
 *  also how those views know they are the whole screen. */
export const ToChatProvider = ToChat.Provider;

export function useToChat(): (() => void) | null {
  return useContext(ToChat);
}

const ScriptLink = createContext<(() => void) | null>(null);

/** Where the script is not on screen beside the timeline (a phone), the
 *  timeline leads to it: this opens it. */
export const ScriptLinkProvider = ScriptLink.Provider;

export function useScriptLink(): (() => void) | null {
  return useContext(ScriptLink);
}
