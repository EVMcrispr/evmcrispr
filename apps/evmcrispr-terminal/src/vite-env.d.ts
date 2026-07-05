// eslint-disable-next-line spaced-comment
/// <reference types="vite/client" />

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "@fontsource/jetbrains-mono";
declare module "@fontsource/jetbrains-mono/700.css";

declare module "virtual:evmcrispr-modules";
