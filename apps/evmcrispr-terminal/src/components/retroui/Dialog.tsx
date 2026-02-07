"use client";

import * as ReactDialog from "@radix-ui/react-dialog";

import { type VariantProps, cva } from "class-variance-authority";
import { type HTMLAttributes, type ReactNode, forwardRef } from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = ReactDialog.Root;
const DialogTrigger = ReactDialog.Trigger;

const overlayVariants = cva(
  `fixed bg-black/80 font-head
    data-[state=open]:fade-in-0
    data-[state=open]:animate-in
    data-[state=closed]:animate-out
    data-[state=closed]:fade-out-0`,
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

const DialogBackdrop = forwardRef<HTMLDivElement, IDialogBackgroupProps>(
  function DialogBackdrop(inputProps, forwardedRef) {
    const { variant = "default", className, ...props } = inputProps;
    return (
      <ReactDialog.Overlay
        ref={forwardedRef}
        className={cn(overlayVariants({ variant, className }))}
        {...props}
      />
    );
  },
);
DialogBackdrop.displayName = "DialogBackdrop";

const dialogVariants = cva(
  `fixed left-[50%] top-[50%] z-50 grid rounded-none overflow-hidden w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border-2 bg-background shadow-lg duration-200
    data-[state=open]:animate-in
    data-[state=open]:fade-in-0
    data-[state=open]:zoom-in-95
    data-[state=closed]:animate-out
    data-[state=closed]:fade-out-0
    data-[state=closed]:zoom-out-95`,
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
        screen: "max-w-[100%]",
      },
    },
    defaultVariants: {
      size: "auto",
    },
  },
);

interface IDialogContentProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof dialogVariants> {
  overlay?: IDialogBackgroupProps;
}

const DialogContent = forwardRef<HTMLDivElement, IDialogContentProps>(
  function DialogContent(inputProps, forwardedRef) {
    const {
      children,
      size = "auto",
      className,
      overlay,
      ...props
    } = inputProps;

    return (
      <ReactDialog.Portal>
        <DialogBackdrop {...overlay} />
        <ReactDialog.Content
          ref={forwardedRef}
          className={cn(dialogVariants({ size, className }))}
          {...props}
        >
          <VisuallyHidden>
            <ReactDialog.Description />
          </VisuallyHidden>
          {children}
        </ReactDialog.Content>
      </ReactDialog.Portal>
    );
  },
);
DialogContent.displayName = "DialogContent";

interface IDialogDescriptionProps
  extends HTMLAttributes<HTMLParagraphElement> {}
const DialogDescription = ({
  children,
  className,
  ...props
}: IDialogDescriptionProps) => {
  return (
    <ReactDialog.Description
      className={cn("px-4 py-2 text-sm", className)}
      {...props}
    >
      {children}
    </ReactDialog.Description>
  );
};

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
}: IDialogFooterProps) => {
  return (
    <div
      className={cn(dialogFooterVariants({ variant, position, className }))}
      {...props}
    >
      {children}
    </div>
  );
};

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

const DialogHeaderDefaultLayout = ({ children }: { children: ReactNode }) => {
  return (
    <>
      {children}
      <ReactDialog.Close className="cursor-pointer">
        <X className="size-5" />
      </ReactDialog.Close>
    </>
  );
};

interface IDialogHeaderProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof dialogHeaderVariants>,
    ReactDialog.DialogTitleProps {}

const DialogHeader = ({
  children,
  className,
  position,
  variant,
  asChild,
  ...props
}: IDialogHeaderProps) => {
  return (
    <ReactDialog.Title
      className={cn(dialogHeaderVariants({ variant, position, className }))}
      asChild={asChild}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <DialogHeaderDefaultLayout>{children}</DialogHeaderDefaultLayout>
      )}
    </ReactDialog.Title>
  );
};

const DialogComponent = Object.assign(Dialog, {
  Trigger: DialogTrigger,
  Header: DialogHeader,
  Content: DialogContent,
  Description: DialogDescription,
  Footer: DialogFooter,
});

export { DialogComponent as Dialog };
