import { defineStyle, defineStyleConfig } from '@chakra-ui/react';

const clearerVariant = defineStyle(() => {
  return {
    fontFamily: '"Ubuntu Mono", monospace',
  };
});

// define custom variants
const variants = {
  clearer: clearerVariant,
};

const baseStyle = {
  fontFamily: '"Pixel Operator Mono", monospace',
};

const textTheme = defineStyleConfig({
  baseStyle,
  variants,
});

export default textTheme;
