import { type HtmlHTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-none border-2 p-4 font-clearer",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground [&_svg]:shrink-0",
        solid: "border-white",
      },
      status: {
        error: "bg-evm-pink-700 text-white border-evm-pink-700",
        success: "bg-evm-green-800 text-white border-evm-green-800",
        warning: "bg-evm-orange-700 text-white border-evm-orange-700",
        info: "bg-evm-gray-800 text-white border-evm-gray-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface IAlertProps
  extends HtmlHTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

const Alert = ({ className, variant, status, ...props }: IAlertProps) => (
  <div
    className={cn(alertVariants({ variant, status, className }))}
    {...props}
  />
);
Alert.displayName = "Alert";

interface IAlertTitleProps extends HtmlHTMLAttributes<HTMLHeadingElement> {}
const AlertTitle = ({ className, ...props }: IAlertTitleProps) => (
  <h5 className={cn("font-bold", className)} {...props} />
);
AlertTitle.displayName = "AlertTitle";

interface IAlertDescriptionProps
  extends HtmlHTMLAttributes<HTMLParagraphElement> {}
const AlertDescription = ({ className, ...props }: IAlertDescriptionProps) => (
  <p
    className={cn("text-sm px-2.5 flex w-full items-center", className)}
    {...props}
  />
);
AlertDescription.displayName = "AlertDescription";

const AlertComponent = Object.assign(Alert, {
  Title: AlertTitle,
  Description: AlertDescription,
});

export { AlertComponent as Alert };
