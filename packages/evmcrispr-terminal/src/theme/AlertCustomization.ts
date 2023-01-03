import { alertAnatomy as parts } from '@chakra-ui/anatomy';
import { createMultiStyleConfigHelpers } from '@chakra-ui/styled-system';

const { definePartsStyle, defineMultiStyleConfig } =
  createMultiStyleConfigHelpers(parts.keys);

const baseStyle = definePartsStyle((props) => {
  return {
    icon: {
      color: 'white',
    },
    container: {
      fontFamily: 'Ubuntu Mono, monospace',
      bgColor:
        props.status === 'error'
          ? 'pink.700'
          : props.status === 'success'
          ? 'green.800'
          : props.status === 'info'
          ? 'blue.500'
          : 'orange.700',
      border: '1px solid',
      borderColor: 'white',
    },
    title: {
      color: 'white',
    },
    description: {
      px: 2.5,
      display: 'flex',
      w: 'full',
      alignItems: 'center',
      color: 'white',
      fontSize: 'md',
    },
  };
});

const alertTheme = defineMultiStyleConfig({
  baseStyle,
});

export default alertTheme;
