import { useEffect, useState } from "react";
import { MOBILE_BREAKPOINT } from "../constants/layout";

export function useSmallScreen(breakpoint = MOBILE_BREAKPOINT) {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isSmallScreen, setIsSmallScreen] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) =>
      setIsSmallScreen(event.matches);

    setIsSmallScreen(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return isSmallScreen;
}
