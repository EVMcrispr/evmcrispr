import { defineStyle, defineStyleConfig } from '@chakra-ui/styled-system';
import { merge } from '@chakra-ui/merge-utils';

const baseStyle = defineStyle({
  borderRadius: 'none', // <-- border radius is same for all variants and sizes
  textDecoration: 'none',
  _hover: {
    transition: 'all 0.2s',
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
    color: 'gray.900',

    _hover: {
      bgColor: `${c}.300 !important`,
      opacity: 0.7,
    },
  };
});

const overlayVariant = defineStyle((props) => {
  const { colorScheme: c } = props;

  return {
    bgColor: `transparent`,
    color: 'gray.900',
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
      height: 'calc(100% + 4px)',
      width: 'calc(100% + 4px)',

      top: '-2px',
      left: '-2px',
      zIndex: '-1',
    },

    _after: {
      content: '""',
      display: 'block',
      boxSizing: 'border-box',
      background: `${c}.800`,
      border: `3px solid ${c}.800`,
      height: 'calc(100% + 4px)',
      width: 'calc(100% + 4px)',
      position: 'absolute',
      top: '2px',
      left: '2px',
      right: 0,
      zIndex: '-2',
      transition: 'all 0.2s',
    },

    _hover: {
      color: `${c}.300`,

      _before: {
        bgColor: 'black',
      },
    },

    _active: {
      transform: 'translate(4px, 4px)',

      _after: {
        transform: 'translate(-4px, -4px)',
      },
    },

    _disabled: {
      color: 'gray.200',
      _before: {
        borderColor: 'gray.200',
      },
      _hover: {
        color: 'gray.200',
        _before: {
          bgColor: 'black',
          borderColor: 'gray.200',
        },
      },
      _active: {
        transform: 'none',
        _after: {
          transform: 'none',
        },
      },
      _after: {
        background: `gray.700`,
      },
    },
  };
});

const blueVariant = defineStyle((props) => {
  props.colorScheme = 'blue';
  return merge(overlayVariant(props), {
    color: 'green.300',
    _before: {
      bgColor: 'blue.600',
      borderColor: 'blue.600',
    },
    _after: {
      bgColor: 'blue.300',
      borderColor: 'blue.300',
    },
    _hover: {
      color: 'green.300',
      _before: {
        bgColor: 'gray.900',
        borderColor: 'gray.900',
      },
      _after: {
        bgColor: 'green.600',
        borderColor: 'green.600'
      }
    },
  });
});

const outlineVariant = defineStyle((props) => {
  const { colorScheme: c } = props;
  return {
    color: `${c}.300`,
    borderWidth: '2px',
    borderColor: `${c}.300`,
    bgColor: 'gray.900',
    '&:not(:hover) .chakra-button__icon': {
      color: `${c}.300`,
    },
    _hover: {
      color: 'gray.900',
      bgColor: `${c}.300`,
    },
    _active: {
      color: 'gray.900',
      bgColor: `${c}.300`,
    },
  };
});

const outlineOverlayVariant = defineStyle((props) => {
  return merge(overlayVariant(props), {
    color: 'green.300',
    _before: {
      borderColor: 'green.300',
      bgColor: 'gray.900',
    },
    _hover: {
      color: 'gray.900',
      _before: {
        backgroundColor: 'green.300',
      },
    },
  });
});

const buttonTheme = defineStyleConfig({
  baseStyle,
  sizes,
  variants: {
    outline: outlineVariant,
    'outline-overlay': outlineOverlayVariant,
    blue: blueVariant,
    lime: limeVariant,
    warning: warningVariant,
    overlay: overlayVariant,
    solid: solidVariant,
  },
  defaultProps: {
    variant: 'solid',
    size: 'lg',
  },
});

export default buttonTheme;
