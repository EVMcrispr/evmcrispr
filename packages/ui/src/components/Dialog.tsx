"use client";

// Adapted from RetroUI's Dialog (MIT, github.com/Logging-Studio/RetroUI),
// which is built on Base UI.
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "../utils";

const Dialog = BaseDialog.Root;
const DialogTrigger = BaseDialog.Trigger;

const overlayVariants = cva(
  "fixed bg-black/80 font-head transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0",
  {
    variants: {
      variant: {
        default: "inset-0 z-50 bg-black/85",
        none: "fixed bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface IDialogBackgroupProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof overlayVariants> {}

const DialogBackdrop = ({
  variant = "default",
  className,
  ...props
}: IDialogBackgroupProps) => (
  <BaseDialog.Backdrop
    className={cn(overlayVariants({ variant }), className)}
    {...props}
  />
);

const dialogVariants = cva(
  "fixed left-[50%] top-[50%] z-50 grid rounded-(--radius) overflow-hidden w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border-2 bg-background shadow-lg transition-[opacity,scale] duration-200 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
  {
    variants: {
      size: {
        auto: "max-w-fit",
        sm: "lg:max-w-[30%]",
        md: "lg:max-w-[40%]",
        lg: "lg:max-w-[50%]",
        xl: "lg:max-w-[60%]",
        "2xl": "lg:max-w-[70%]",
        "3xl": "lg:max-w-[80%]",
        "4xl": "lg:max-w-[90%]",
        screen: "max-w-full",
      },
    },
    defaultVariants: {
      size: "auto",
    },
  },
);

type IDialogContentProps = BaseDialog.Popup.Props &
  VariantProps<typeof dialogVariants> & {
    overlay?: IDialogBackgroupProps;
    className?: string;
    ref?: Ref<HTMLDivElement>;
  };

const DialogContent = ({
  children,
  size = "auto",
  className,
  overlay,
  ...props
}: IDialogContentProps) => (
  <BaseDialog.Portal>
    <DialogBackdrop {...overlay} />
    <BaseDialog.Popup
      className={cn(dialogVariants({ size }), className)}
      {...props}
    >
      {children}
    </BaseDialog.Popup>
  </BaseDialog.Portal>
);

interface IDialogDescriptionProps
  extends HTMLAttributes<HTMLParagraphElement> {}
const DialogDescription = ({
  children,
  className,
  ...props
}: IDialogDescriptionProps) => (
  <BaseDialog.Description
    className={cn("px-4 py-2 text-sm", className)}
    {...props}
  >
    {children}
  </BaseDialog.Description>
);

const dialogFooterVariants = cva(
  "flex items-center justify-end border-t-2 min-h-12 gap-4 px-4 py-2",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
      },
      position: {
        fixed: "sticky bottom-0",
        static: "static",
      },
    },
    defaultVariants: {
      position: "fixed",
    },
  },
);

export interface IDialogFooterProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof dialogFooterVariants> {}

const DialogFooter = ({
  children,
  className,
  position,
  variant,
  ...props
}: IDialogFooterProps) => (
  <div
    className={cn(dialogFooterVariants({ variant, position }), className)}
    {...props}
  >
    {children}
  </div>
);

const dialogHeaderVariants = cva(
  "flex items-center justify-between border-b-2 px-4 min-h-12",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
      },
      position: {
        fixed: "sticky top-0",
        static: "static",
      },
    },
    defaultVariants: {
      variant: "default",
      position: "static",
    },
  },
);

const DialogHeaderDefaultLayout = ({ children }: { children: ReactNode }) => (
  <>
    {children}
    <BaseDialog.Close aria-label="Close" className="cursor-pointer">
      <X className="size-5" />
    </BaseDialog.Close>
  </>
);

interface IDialogHeaderProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof dialogHeaderVariants> {
  /** The children are the whole header: no close button is added. */
  asChild?: boolean;
}

/** The dialog's title: what the dialog is named by. */
const DialogHeader = ({
  children,
  className,
  position,
  variant,
  asChild,
  ...props
}: IDialogHeaderProps) => (
  <BaseDialog.Title
    render={<div />}
    className={cn(dialogHeaderVariants({ variant, position }), className)}
    {...props}
  >
    {asChild ? (
      children
    ) : (
      <DialogHeaderDefaultLayout>{children}</DialogHeaderDefaultLayout>
    )}
  </BaseDialog.Title>
);

const DialogComponent = Object.assign(Dialog, {
  Trigger: DialogTrigger,
  Header: DialogHeader,
  Content: DialogContent,
  Description: DialogDescription,
  Footer: DialogFooter,
  Close: BaseDialog.Close,
});

export { DialogComponent as Dialog };
