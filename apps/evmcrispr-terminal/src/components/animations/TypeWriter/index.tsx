import { Text, keyframes } from "@chakra-ui/react";

const typing = keyframes`
from { width: 0 }
to { width: 100% }
`;

/* The typewriter cursor effect */
const blinkCaret = keyframes`
from { border-color: #fff; }
to { border-color: transparent; }
99% { border-color: #fff; }
`;

export default function TypeWriter({ text }: { text: string }) {
  const duration = text.length / 10;
  return (
    <Text
      color="white"
      fontSize="sm"
      variant="clearer"
      border="none"
      background="transparent"
      overflow="hidden" // Ensures the content is not revealed until the animation
      borderRight=".5em solid transparent" // The typwriter cursor
      whiteSpace="nowrap" // / Keeps the content on a single line
      letterSpacing=".12em" // Adjust as needed
      animation={`${typing} ${duration}s steps(40, end), ${blinkCaret} ${duration}s step-end 1`}
    >
      {text}
    </Text>
  );
}
