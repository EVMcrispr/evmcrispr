import { menuAnatomy } from "@chakra-ui/anatomy";
import { createMultiStyleConfigHelpers } from "@chakra-ui/react";

const { definePartsStyle, defineMultiStyleConfig } =
  createMultiStyleConfigHelpers(menuAnatomy.keys);

const baseStyle = definePartsStyle({
  list: {
    borderRadius: "none",
    background: "black",
    borderColor: "green.300",
    padding: "0",
  },
  item: {
    bg: "black",
    _hover: {
      color: "black",
      bg: "green.300",
    },
  },
});

const menuTheme = defineMultiStyleConfig({
  baseStyle,
});

export default menuTheme;
