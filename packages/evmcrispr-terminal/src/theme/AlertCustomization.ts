import { alertAnatomy as parts } from '@chakra-ui/anatomy';
import { createMultiStyleConfigHelpers } from '@chakra-ui/styled-system';

const { definePartsStyle, defineMultiStyleConfig } =
  createMultiStyleConfigHelpers(parts.keys);

const baseStyle = definePartsStyle((props) => {
  return {
    container: {
      bgColor: props.status === 'info' ? 'transparent' : 'var(--alert-bg)',
      border: '1px solid',
    },
    description: {
      fontWeight: 'semibold',
      px: 2.5,
      py: 5,
      display: 'flex',
      w: 'full',
      alignItems: 'center',
      justifyContent: 'center',
    },
  };
});

const alertTheme = defineMultiStyleConfig({
  baseStyle,
});

export default alertTheme;
