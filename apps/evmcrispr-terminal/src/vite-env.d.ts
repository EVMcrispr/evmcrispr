// eslint-disable-next-line spaced-comment
/// <reference types="vite/client" />

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "@fontsource/ubuntu-mono";

declare module "virtual:evmcrispr-modules";
