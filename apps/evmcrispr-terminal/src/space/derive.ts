// A new space made of text that is already inside the app. Making a space
// must not turn a text nobody reviewed into an approved one: the new space
// starts approved only if the text is approved where it comes from, and
// that is asked of the source space's approved texts, never of what an
// entry says about its author or its source.
import type { LiveSpace } from "./live-space";
import type { Spaces } from "./spaces";

/** From an entry of `source`'s timeline. */
export function spaceFromEntry(
  spaces: Spaces,
  source: LiveSpace,
  text: string,
): Promise<string> {
  return spaces.create({
    text,
    source: "import",
    ...(source.wasApproved(text) ? {} : { unreviewed: true as const }),
  });
}

/** From something a program produced (a card in the assistant's chat):
 *  never approved. */
export function spaceFromProgram(
  spaces: Spaces,
  text: string,
): Promise<string> {
  return spaces.create({ text, source: "import", unreviewed: true });
}
