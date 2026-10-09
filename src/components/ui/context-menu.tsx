import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn(
          "mc-frame z-50 min-w-56 overflow-hidden bg-card p-1 text-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({ className, destructive = false, ...props }: ComponentProps<typeof ContextMenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded px-2.5 py-2 text-[13px] font-semibold outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
        destructive ? "text-[#f3a19e] data-[highlighted]:bg-destructive/15" : "data-[highlighted]:bg-primary/15 data-[highlighted]:text-primary [&_svg]:text-muted-foreground data-[highlighted]:[&_svg]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

export function ContextMenuSeparator({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn("mx-1 my-1 h-px bg-border", className)} {...props} />;
}
