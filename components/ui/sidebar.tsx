"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Menu, PanelLeft, PanelRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";

type SidebarPinMode = "hover" | "open" | "closed";

interface SidebarContextValue {
  open: boolean;
  setOpen: (value: boolean) => void;
  isMobile: boolean;
  hovered: boolean;
  setHovered: (value: boolean) => void;
  pinMode: SidebarPinMode;
  setPinMode: (value: SidebarPinMode) => void;
  desktopExpanded: boolean;
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

function SidebarProvider({ children, defaultOpen = false }: { children: React.ReactNode; defaultOpen?: boolean }) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [open, setOpen] = React.useState(defaultOpen);
  const [hovered, setHovered] = React.useState(false);
  const [pinMode, setPinMode] = React.useState<SidebarPinMode>("hover");
  const desktopExpanded = pinMode === "open" || (pinMode === "hover" && hovered);
  const collapsed = isMobile ? false : !desktopExpanded;

  function setCollapsed(value: boolean) {
    if (isMobile) return;
    setHovered(false);
    setPinMode(value ? "closed" : "open");
  }

  function toggleCollapsed() {
    if (isMobile) return;
    setHovered(false);
    setPinMode((prev) => {
      if (prev === "hover") return "open";
      if (prev === "open") return "closed";
      return "hover";
    });
  }

  return (
    <SidebarContext.Provider
      value={{
        open,
        setOpen,
        isMobile,
        hovered,
        setHovered,
        pinMode,
        setPinMode,
        desktopExpanded,
        collapsed,
        setCollapsed,
        toggleCollapsed
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

const Sidebar = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, children, onMouseEnter, onMouseLeave, ...props }, ref) => {
    const { open, setOpen, isMobile, collapsed, pinMode, setHovered, desktopExpanded } = useSidebar();

    if (isMobile) {
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className={cn("w-72 p-0", className)}>
            <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground" {...props}>
              {children}
            </aside>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <div className="sticky top-0 z-40 hidden h-screen w-16 shrink-0 md:block">
        <aside
          ref={ref}
          data-collapsed={collapsed ? "true" : "false"}
          className={cn(
            "group absolute inset-y-0 left-0 flex h-screen flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,box-shadow] duration-300 ease-in-out",
            collapsed ? "w-16" : "w-72",
            desktopExpanded ? "shadow-xl shadow-black/10 dark:shadow-black/35" : "shadow-none",
            className
          )}
          onMouseEnter={(event) => {
            onMouseEnter?.(event);
            if (pinMode === "hover") setHovered(true);
          }}
          onMouseLeave={(event) => {
            onMouseLeave?.(event);
            if (pinMode === "hover") setHovered(false);
          }}
          {...props}
        >
          <TooltipProvider delayDuration={50}>{children}</TooltipProvider>
        </aside>
      </div>
    );
  }
);
Sidebar.displayName = "Sidebar";

const SidebarInset = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex min-h-screen flex-1 flex-col bg-muted/30", className)} {...props} />
  )
);
SidebarInset.displayName = "SidebarInset";

const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof Button>>(
  ({ className, onClick, ...props }, ref) => {
    const { open, setOpen, isMobile, toggleCollapsed } = useSidebar();
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        className={cn(className)}
        onClick={(event) => {
          onClick?.(event);
          if (isMobile) {
            setOpen(!open);
            return;
          }
          toggleCollapsed();
        }}
        {...props}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Navigation umschalten</span>
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
        className={cn("flex flex-col gap-2 border-b border-sidebar-border p-4", collapsed && "items-center", className)}
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
    <div ref={ref} className={cn("border-t border-sidebar-border p-4", className)} {...props} />
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
          "group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
          collapsed && "justify-center gap-0",
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
