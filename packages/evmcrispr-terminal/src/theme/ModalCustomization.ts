import type { ComponentStyleConfig } from '@chakra-ui/react';

const Modal: ComponentStyleConfig = {
  // The styles all button have in common
  parts: ['dialog'],
  baseStyle: {
    dialog: {
      bg: 'black',
      border: '3px solid',
      borderColor: 'brand.green.300',
    },
  },
};

export default Modal;
