import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-e border-border/60 p-4 gap-3">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-8 w-full" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-16 border-b border-border/60 flex items-center gap-3 px-4">
          <Skeleton className="h-10 flex-1 max-w-md" />
          <Skeleton className="size-10 rounded-lg" />
          <Skeleton className="size-10 rounded-full" />
        </div>
        <div className="p-4 lg:p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
