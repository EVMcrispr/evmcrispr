import { switchAnatomy } from '@chakra-ui/anatomy';
import { createMultiStyleConfigHelpers, defineStyle } from '@chakra-ui/react';

const { definePartsStyle, defineMultiStyleConfig } =
  createMultiStyleConfigHelpers(switchAnatomy.keys);

const baseStyleTrack = defineStyle({
  _checked: {
    bg: 'brand.gray.500',
  },
  bg: 'brand.yellow.100',
});

const baseStyle = definePartsStyle({
  thumb: {
    _checked: {
      background: 'brand.green.300',
    },
    background: 'black',
  },
  track: baseStyleTrack,
});

const switchTheme = defineMultiStyleConfig({
  baseStyle,
});

export default switchTheme;
