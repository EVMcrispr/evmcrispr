import Modal from "./ModalCustomization";
import Button from "./ButtonCustomization";
import Switch from "./SwitchCustomization";
import Alert from "./AlertCustomization";
import Tooltip from "./TooltipCustomization";
import Text from "./TextCustomization";
import Menu from "./MenuCustomization";

const theme = {
  initialColorMode: "dark",
  useSystemColorMode: false,
  colors: {
    blue: {
      "50": "#E9E9FC",
      "100": "#C0C0F6",
      "200": "#9898F1",
      "300": "#7070EB",
      "400": "#4848E5",
      "500": "#1F1FE0",
      "600": "#1919B3",
      "700": "#131386",
      "800": "#0D0D59",
      "900": "#06062D",
    },
    green: {
      "50": "#EDFDE7",
      "100": "#CDFABC",
      "200": "#ACF791",
      "300": "#8CF467",
      "400": "#6CF13C",
      "500": "#4BEE11",
      "600": "#3CBE0E",
      "700": "#2D8F0A",
      "800": "#1E5F07",
      "900": "#0F3003",
    },
    yellow: {
      "50": "#FAFEE7",
      "100": "#F2FCBA",
      "200": "#EAFA8E",
      "300": "#E2F962",
      "400": "#DAF736",
      "500": "#D2F50A",
      "600": "#A8C408",
      "700": "#7E9306",
      "800": "#546204",
      "900": "#2A3102",
    },
    pink: {
      "50": "#FDE7F6",
      "100": "#FABCE5",
      "200": "#F791D5",
      "300": "#F467C4",
      "400": "#F13CB3",
      "500": "#EE11A3",
      "600": "#BE0E82",
      "700": "#8F0A62",
      "800": "#5F0741",
      "900": "#300321",
    },
    gray: {
      "50": "#F2F2F2",
      "100": "#DBDBDB",
      "200": "#C4C4C4",
      "300": "#ADADAD",
      "400": "#969696",
      "500": "#808080",
      "600": "#666666",
      "700": "#4D4D4D",
      "800": "#292929",
      "900": "#121212",
    },
    red: {
      "50": "#FFE6E9",
      "100": "#FEB8C1",
      "200": "#FE8B99",
      "300": "#FD5D71",
      "400": "#FD3049",
      "500": "#FD0221",
      "600": "#CA021A",
      "700": "#980114",
      "800": "#65010D",
      "900": "#330007",
    },
    orange: {
      "50": "#FDEFE8",
      "100": "#F9D2BD",
      "200": "#F6B593",
      "300": "#F29869",
      "400": "#EF7C3E",
      "500": "#EB5F14",
      "600": "#BC4C10",
      "700": "#8D390C",
      "800": "#5E2608",
      "900": "#2F1304",
    },
  },
  fonts: {
    heading: '"Pixel Operator Mono", monospace',
    body: '"Pixel Operator Mono", monospace',
    mono: '"Pixel Operator Mono", monospace',
  },
  components: {
    Modal,
    Button,
    Switch,
    Alert,
    Tooltip,
    Text,
    Menu,
  },
  shadows: {
    outline: "green.900",
  },
};

export default theme;
