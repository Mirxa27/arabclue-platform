import * as React from "react"
import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-0 rounded-[16px] border border-border/60 shadow-[0_1px_1px_rgba(0,0,0,0.02),0_0_0_1px_rgba(0,0,0,0.02)_inset] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)_inset] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "dark:bg-[var(--surface-1)] dark:border-[var(--hairline)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_8px_24px_rgba(0,0,0,0.24)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_12px_32px_rgba(0,0,0,0.32)] dark:hover:border-[var(--hairline-light)]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-5 py-4 sm:px-6 sm:py-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] border-b border-border/40 dark:border-[var(--hairline)] [.border-b]:pb-5",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-[1.15] font-[600] tracking-[-0.02em] text-[15px] sm:text-[16px]", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-description" className={cn("text-muted-foreground text-[13px] leading-[1.5] dark:text-white/50", className)} {...props} />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-5 sm:px-6 py-4 sm:py-5", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center px-5 sm:px-6 py-4 border-t border-border/40 dark:border-[var(--hairline)] [.border-t]:pt-4", className)} {...props} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
