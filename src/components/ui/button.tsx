import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base: Linear/Stripe premium — 6 microstates crafted, 44px touch awareness, physical metaphor
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[13.5px] font-[550] tracking-[-0.01em] transition-all duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none select-none touch-manipulation active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[oklch(0.72_0.12_195)] focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_1px_1px_rgba(0,0,0,0.08)] hover:bg-primary/90 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.10)_inset,0_4px_12px_rgba(0,0,0,0.12)] active:shadow-none",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline: "border border-border bg-background/80 backdrop-blur-sm shadow-sm hover:bg-accent hover:text-accent-foreground dark:bg-white/[0.06] dark:border-white/10 dark:text-white/80 dark:hover:bg-white/[0.10] dark:hover:text-white dark:hover:border-white/15",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm",
        ghost: "text-foreground/70 hover:bg-accent hover:text-accent-foreground dark:text-white/60 dark:hover:bg-white/[0.06] dark:hover:text-white",
        link: "text-primary underline-offset-4 hover:underline rounded-none",
        premium: "bg-white text-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_4px_16px_rgba(255,255,255,0.12)] hover:bg-white/90 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_8px_24px_rgba(255,255,255,0.16)] active:scale-[0.97]",
        glass: "bg-white/[0.06] text-white/80 backdrop-blur-md border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] hover:bg-white/[0.10] hover:text-white hover:border-white/15 hover:shadow-[0_8px_24px_rgba(0,0,0,0.20)]",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 min-h-[36px]",
        sm: "h-8 rounded-full gap-1.5 px-3.5 has-[>svg]:px-2.5 text-[12.5px] min-h-[32px]",
        lg: "h-11 rounded-full px-6 has-[>svg]:px-4 text-[14px] min-h-[44px]",
        xl: "h-12 rounded-full px-7 has-[>svg]:px-5 text-[14px] min-h-[48px]",
        icon: "size-9 rounded-full min-h-[36px] min-w-[36px]",
        "icon-lg": "size-10 rounded-full min-h-[44px] min-w-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
