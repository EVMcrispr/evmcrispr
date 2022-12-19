import type { ComponentMultiStyleConfig } from '@chakra-ui/react';

const Switch: ComponentMultiStyleConfig = {
  parts: ['track'],
  baseStyle: {
    track: {
      _checked: {
        background: 'brand.green.300',
      },
    },
    thumb: {
      _checked: {
        background: 'brand.green.900',
      },
    },
  },
};

export default Switch;
