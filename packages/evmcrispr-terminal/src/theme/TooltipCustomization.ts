import { defineStyleConfig } from '@chakra-ui/react';

const baseStyle = {
  background: 'brand.green.300',
  borderRadius: 'none',
};

const tooltipTheme = defineStyleConfig({
  baseStyle,
});

export default tooltipTheme;
