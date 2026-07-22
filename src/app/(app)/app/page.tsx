"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { DashboardViews } from "@/components/dashboard/views";

export default function WorkspacePage() {
  return (
    <AppShell>
      <DashboardViews />
    </AppShell>
  );
}
