import { switchAnatomy } from '@chakra-ui/anatomy';
import { createMultiStyleConfigHelpers, defineStyle } from '@chakra-ui/react';

const { definePartsStyle, defineMultiStyleConfig } =
  createMultiStyleConfigHelpers(switchAnatomy.keys);

const baseStyleTrack = defineStyle({
  _checked: {
    bg: 'brand.green.300',
  },
  borderRadius: 'none',
});

const baseStyle = definePartsStyle({
  thumb: {
    background: 'black',
  },
  track: baseStyleTrack,
});

const switchTheme = defineMultiStyleConfig({
  baseStyle,
});

export default switchTheme;
