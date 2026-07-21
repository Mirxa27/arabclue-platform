"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { DashboardViews } from "@/components/dashboard/views";
import { QueryProvider } from "@/components/providers/query-provider";

export default function Home() {
  return (
    <QueryProvider>
      <AppShell>
        <DashboardViews />
      </AppShell>
    </QueryProvider>
  );
}
