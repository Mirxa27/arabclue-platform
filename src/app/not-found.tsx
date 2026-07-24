import Link from "next/link";
import { ArabclueLogo } from "@/components/brand/arabclue-logo";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 bg-[radial-gradient(ellipse_at_top,rgba(15,118,110,0.12),transparent_55%),linear-gradient(180deg,#f8fafc,transparent)]">
      <ArabclueLogo className="size-14 rounded-xl shadow-lg shadow-teal-900/10" />
      <div className="text-center space-y-2 max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-800/70">
          ArabClue
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Page not found
        </h1>
        <p className="text-sm text-slate-600" dir="rtl">
          الصفحة غير موجودة
        </p>
        <p className="text-sm text-slate-500">
          The link may be broken or the page was moved.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-lg bg-teal-800 px-4 text-sm font-medium text-white hover:bg-teal-700"
        >
          Home
        </Link>
        <Link
          href="/app"
          className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Workspace
        </Link>
      </div>
    </main>
  );
}
