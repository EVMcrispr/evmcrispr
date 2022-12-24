import { defineStyle, defineStyleConfig } from '@chakra-ui/styled-system';

const baseStyle = defineStyle({
  borderRadius: 'none', // <-- border radius is same for all variants and sizes
  textDecoration: 'none',
  _hover: {
    transition: 'all 0.5s',
  },
  _focus: {
    boxShadow: 'none',
  },
  fontWeight: 'normal',
});

const sizes = {
  sm: defineStyle({
    fontSize: 'sm',
    px: 4, // <-- px is short for paddingLeft and paddingRight
    py: 3, // <-- py is short for paddingTop and paddingBottom
  }),
  md: defineStyle({
    fontSize: 'xl',
    px: 6, // <-- these values are tokens from the design system
    py: 4, // <-- these values are tokens from the design system
  }),
  lg: defineStyle({
    fontSize: '2xl',
    px: 6,
    py: 3,
    minWidth: 48,
  }),
};

const limeVariant = defineStyle({
  color: 'gray.900',
  bgColor: 'green.300',
  _hover: {
    bgColor: 'gray.900',
    color: 'green.300',
  },
});

const warningVariant = defineStyle({
  color: 'orange.50',
  bgColor: 'orange.400',
  _hover: {
    bgColor: 'orange.50',
    color: 'orange.400',
  },
});

const solidVariant = defineStyle((props) => {
  const { colorScheme: c } = props;
  return {
    bgColor: `${c}.300`,
    color: 'gray.700',

    _hover: {
      bgColor: `${c}.300 !important`,
      opacity: 0.7,
    },
  };
});

const outlineVariant = defineStyle(() => {
  const activeStyle = {
    bgColor: 'green.300 !important',
    color: 'gray.700',
    '& svg': {
      color: 'gray.700',
    },
  };

  return {
    color: 'green.300',
    border: '2px solid',
    borderColor: 'green.300',
    bgColor: 'transparent',

    _active: activeStyle,
    _visited: activeStyle,
    _focus: activeStyle,

    _disabled: {
      opacity: 0.3,
    },
  };
});

const overlayVariant = defineStyle((props) => {
  const { colorScheme: c } = props;

  return {
    bgColor: `transparent`,
    color: 'gray.700',
    border: '1px solid',
    borderColor: `${c}.300`,
    position: 'relative',
    boxSizing: 'border-box',
    top: '-2px',
    left: '-2px',
    transition: 'all 0.2s',
    zIndex: '2',

    _before: {
      boxSizing: 'border-box',
      bgColor: `${c}.300`,
      border: '1px solid',
      borderColor: `${c}.300`,
      content: '""',
      position: 'absolute',
      height: 'calc(100% + 6px)',
      width: 'calc(100% + 6px)',

      top: '-3px',
      left: '-3px',
      zIndex: '-1',
    },

    _after: {
      content: '""',
      display: 'block',
      boxSizing: 'border-box',
      background: `${c}.800`,
      border: '3px solid green.800',
      height: 'calc(100% + 6px)',
      width: 'calc(100% + 6px)',
      position: 'absolute',
      top: '3px',
      left: '3px',
      right: 0,
      zIndex: '-2',
      transition: 'all 0.2s',
    },

    _hover: {
      color: `${c}.300`,

      _before: {
        bgColor: 'black',
      },

      _disabled: {
        color: 'gray.700',
        bgColor: 'gray.100',
      },
    },

    _active: {
      transform: 'translate(6px, 6px)',

      _after: {
        transform: 'translate(-3px, -3px)',
      },
    },

    _disabled: {
      bgColor: 'gray.100',
      borderColor: 'gray.100',

      _before: {
        borderColor: 'gray.500',
      },
    },
  };
});

const blueVariant = defineStyle({
  color: 'green.300',
  bgColor: 'blue.600',
  _hover: {
    bgColor: 'gray.900',
  },
});

const iconVariant = defineStyle({
  bgColor: 'gray.800',
  color: 'white',
  position: 'relative',
  boxSizing: 'border-box',
  border: '1px solid',
  borderColor: 'yellow.300',
  fontSize: 'md',
  fontWeight: 700,

  _disabled: {
    bgColor: 'gray.100',
    border: '1px solid',
    borderColor: 'black',
  },

  _hover: {
    bgColor: 'gray.800 !important',
    _before: {
      borderRight: '4px solid',
      borderBottom: '3px solid',
      borderColor: 'gray.300',
      top: '4px',
      left: '5px',
    },

    _disabled: {
      bgColor: 'gray.100 !important',
      border: '1px solid',
      borderColor: 'black',
    },
  },

  _before: {
    boxSizing: 'border-box',
    borderRight: '7px solid',
    borderBottom: '8px solid',
    borderColor: 'gray.300',
    content: '""',
    display: 'block',
    height: '100%',
    position: 'absolute',
    width: '100%',
    top: '9px',
    left: '8px',
  },
});

const buttonTheme = defineStyleConfig({
  baseStyle,
  sizes,
  variants: {
    outline: outlineVariant,
    blue: blueVariant,
    lime: limeVariant,
    warning: warningVariant,
    overlay: overlayVariant,
    icon: iconVariant,
    solid: solidVariant,
  },
  defaultProps: {
    variant: 'solid',
    size: 'lg',
  },
});

export default buttonTheme;
