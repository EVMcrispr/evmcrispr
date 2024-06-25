import { Global } from "@emotion/react";

const Fonts = () => (
  <Global
    styles={`
      @font-face {
        font-family: 'Pixel Operator Mono';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('./fonts/PixelOperatorMono.ttf') format('truetype');
      }
      @font-face {
        font-family: 'Pixel Operator Mono';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('./fonts/PixelOperatorMono-Bold.ttf') format('truetype');
      }
      body {
        font-family: "Pixel Operator Mono", monospace;
      }
      `}
  />
);

export default Fonts;
