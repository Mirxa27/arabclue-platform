"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-slate-200 dark:bg-slate-700 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      {/* Width, not translateX: a translated bar fills from the left in RTL. */}
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
