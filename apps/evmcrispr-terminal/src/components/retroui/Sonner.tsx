"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "w-full flex items-center gap-2 border-2 border-border rounded-none px-4 py-3 font-clearer text-sm shadow-md",
          success: "bg-evm-green-800 text-white border-evm-green-800",
          error: "bg-evm-pink-700 text-white border-evm-pink-700",
          warning: "bg-evm-orange-700 text-white border-evm-orange-700",
          info: "bg-evm-gray-500 text-white border-evm-gray-500",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
