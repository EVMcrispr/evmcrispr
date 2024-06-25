import type { CreateToastFnReturn, UseToastOptions } from "@chakra-ui/react";
import { useToast as chakraUseToast } from "@chakra-ui/react";

import Toast from "../components/Toast";

export default function useToast(props?: UseToastOptions): CreateToastFnReturn {
  return chakraUseToast({
    position: "top",
    render: Toast,
    ...props,
  });
}
