import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The four type sizes of theme.css. Unknown to tailwind-merge, a
// `text-caption` would be read as a colour and dropped beside one.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "body", "title", "display"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
