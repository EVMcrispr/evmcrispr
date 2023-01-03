import { modalAnatomy as parts } from '@chakra-ui/anatomy';
import {
  createMultiStyleConfigHelpers,
  defineStyle,
} from '@chakra-ui/styled-system';

const { definePartsStyle, defineMultiStyleConfig } =
  createMultiStyleConfigHelpers(parts.keys);

const baseStyle = definePartsStyle((props) => {
  const { colorScheme: c } = props;
  return {
    header: {
      color: `${c}.300`,
      borderBottom: '2px solid',
      borderColor: `${c}.300`,
    },
    closeButton: {
      color: `${c}.300`,
    },
    dialogContainer: {
      '& > section': {
        boxShadow: `6px 6px var(--chakra-colors-${c}-800)`,
      },
    },
    dialog: {
      bgColor: 'black',
      border: '2px solid',
      borderColor: `${c}.300`,
      borderRadius: 'none',
    },
    body: {
      w: 'full',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
    },
  };
});

const headerBase = defineStyle({
  fontSize: 'lg',
  p: 4,
  lineHeight: 'base',
  fontWeight: 700,
  w: 'full',
});

const mdDialog = defineStyle({
  fontSize: 'md',
  lineHeight: 'base',
});

const lgDialog = defineStyle({
  w: '2xl',
  maxW: 'unset',
  fontSize: '2xl',
  lineHeight: 'base',
});

const xlDialog = defineStyle({
  maxW: 'unset',
  w: '4xl',
  h: 'lg',
  fontSize: '2xl',
  lineHeight: 'base',
});

const xlBody = defineStyle({
  w: 'full',
  h: 'full',
});

const lgBody = defineStyle({
  py: 8,
});

const mdBody = defineStyle({
  px: 10,
  py: 12,
});

const smBody = defineStyle({
  p: 6,
});

const sizes = {
  xl: definePartsStyle({ header: headerBase, dialog: xlDialog, body: xlBody }),
  lg: definePartsStyle({ header: headerBase, dialog: lgDialog, body: lgBody }),
  md: definePartsStyle({ header: headerBase, dialog: mdDialog, body: mdBody }),
  sm: definePartsStyle({ header: headerBase, dialog: mdDialog, body: smBody }),
};

const modalTheme = defineMultiStyleConfig({
  baseStyle,
  sizes,
  defaultProps: {
    size: 'md',
  },
});

export default modalTheme;
