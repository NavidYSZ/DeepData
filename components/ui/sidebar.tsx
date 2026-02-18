"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import * as Collapsible from "@radix-ui/react-collapsible";
import { PanelLeft, PanelRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";

interface SidebarContextValue {
  open: boolean;
  setOpen: (value: boolean) => void;
  isMobile: boolean;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
}

const STORAGE_KEY = "sidebar:collapsed";

function SidebarProvider({ children, defaultOpen = false }: { children: React.ReactNode; defaultOpen?: boolean }) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [open, setOpen] = React.useState(defaultOpen);
  const [collapsed, setCollapsedState] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsedState(true);
  }, []);

  function setCollapsed(value: boolean) {
    setCollapsedState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    }
  }

  function toggleCollapsed() {
    setCollapsed(!collapsed);
  }

  return (
    <SidebarContext.Provider value={{ open, setOpen, isMobile, collapsed, setCollapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

const Sidebar = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen, isMobile, collapsed, setCollapsed } = useSidebar();

    if (isMobile) {
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className={cn("w-72 p-0", className)}>
            <aside className="flex h-full w-full flex-col bg-background" {...props}>
              {children}
            </aside>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <Collapsible.Root open={!collapsed} onOpenChange={(openState) => setCollapsed(!openState)}>
        <aside
          ref={ref}
          data-collapsed={collapsed ? "true" : "false"}
          className={cn(
            "group hidden h-screen flex-col border-r bg-background transition-all md:flex",
            collapsed ? "w-16" : "w-72",
            className
          )}
          {...props}
        >
          <TooltipProvider delayDuration={50}>{children}</TooltipProvider>
        </aside>
      </Collapsible.Root>
    );
  }
);
Sidebar.displayName = "Sidebar";

const SidebarInset = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex min-h-screen flex-1 flex-col bg-muted/40", className)} {...props} />
  )
);
SidebarInset.displayName = "SidebarInset";

const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof Button>>(
  ({ className, onClick, ...props }, ref) => {
    const { setOpen } = useSidebar();
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        className={cn("md:hidden", className)}
        onClick={(event) => {
          onClick?.(event);
          setOpen(true);
        }}
        {...props}
      >
        <PanelLeft className="h-5 w-5" />
        <span className="sr-only">Sidebar öffnen</span>
      </Button>
    );
  }
);
SidebarTrigger.displayName = "SidebarTrigger";

const SidebarRail = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof Button>>(
  ({ className, ...props }, ref) => {
    const { collapsed, toggleCollapsed } = useSidebar();
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        className={cn("ml-auto h-8 w-8", className)}
        onClick={toggleCollapsed}
        {...props}
      >
        {collapsed ? <PanelRight className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        <span className="sr-only">Sidebar umschalten</span>
      </Button>
    );
  }
);
SidebarRail.displayName = "SidebarRail";

const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { collapsed } = useSidebar();
    return (
      <div
        ref={ref}
        className={cn("flex flex-col gap-2 border-b p-4", collapsed && "items-center", className)}
        {...props}
      />
    );
  }
);
SidebarHeader.displayName = "SidebarHeader";

const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex-1 overflow-auto p-2", className)} {...props} />
  )
);
SidebarContent.displayName = "SidebarContent";

const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("border-t p-4", className)} {...props} />
  )
);
SidebarFooter.displayName = "SidebarFooter";

const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("space-y-2", className)} {...props} />
  )
);
SidebarGroup.displayName = "SidebarGroup";

const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { collapsed } = useSidebar();
    return (
      <div
        ref={ref}
        className={cn(
          "px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
          collapsed && "sr-only",
          className
        )}
        {...props}
      />
    );
  }
);
SidebarGroupLabel.displayName = "SidebarGroupLabel";

const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("space-y-1", className)} {...props} />
  )
);
SidebarGroupContent.displayName = "SidebarGroupContent";

const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn("space-y-1", className)} {...props} />
  )
);
SidebarMenu.displayName = "SidebarMenu";

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn("list-none", className)} {...props} />
  )
);
SidebarMenuItem.displayName = "SidebarMenuItem";

interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
}

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, asChild = false, isActive, tooltip, children, ...props }, ref) => {
    const { collapsed } = useSidebar();
    const Comp = asChild ? Slot : "button";

    const content = (
      <Comp
        ref={ref}
        data-active={isActive ? "true" : undefined}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-foreground",
          collapsed && "justify-center",
          className
        )}
        {...props}
      >
        {children}
      </Comp>
    );

    if (!collapsed || !tooltip) return content;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">{tooltip}</TooltipContent>
      </Tooltip>
    );
  }
);
SidebarMenuButton.displayName = "SidebarMenuButton";

export {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarTrigger,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  useSidebar
};
