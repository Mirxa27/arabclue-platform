"use client";

import { startTransition, useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useUI } from "@/lib/store";
import {
  downloadProposalArtifact,
  saveBlob,
  type ArtifactDownloadFormat,
} from "@/lib/download-artifact";

/** 402s whose fix is the billing screen, not a retry. */
const UPGRADE_CODES = new Set([
  "EXPORT_FORMAT_NOT_IN_PLAN",
  "TRIAL_ENDED",
  "SUBSCRIPTION_INACTIVE",
]);

/**
 * Reliable proposal/contract artifact download with toast feedback.
 */
export function useArtifactDownload() {
  const { toast } = useToast();
  const setView = useUI((s) => s.setView);
  const [busyFormat, setBusyFormat] = useState<ArtifactDownloadFormat | null>(
    null
  );

  const download = useCallback(
    async (opts: {
      proposalId: string;
      format: ArtifactDownloadFormat;
      fallbackName?: string;
      locale?: "ar" | "en";
    }) => {
      const ar = opts.locale === "ar";
      setBusyFormat(opts.format);
      try {
        const result = await downloadProposalArtifact({
          proposalId: opts.proposalId,
          format: opts.format,
          fallbackName: opts.fallbackName,
          locale: opts.locale,
        });
        if (!result.ok) {
          // The sentence is bilingual from the route; the gate's issue codes,
          // when present, follow it so the writer knows what to fix.
          const issueList = (result.issues ?? []).slice(0, 5).join(", ");
          const upgrade = result.code ? UPGRADE_CODES.has(result.code) : false;
          toast({
            title: upgrade
              ? ar
                ? "غير مشمول في باقتك"
                : "Not included in your plan"
              : ar
                ? "فشل التنزيل"
                : "Download failed",
            description: issueList ? `${result.error} (${issueList})` : result.error,
            variant: upgrade ? "default" : "destructive",
            ...(upgrade
              ? {
                  action: (
                    <ToastAction
                      altText={ar ? "فتح الفوترة" : "Open billing"}
                      onClick={() => startTransition(() => setView("billing"))}
                    >
                      {ar ? "ترقية الباقة" : "Upgrade plan"}
                    </ToastAction>
                  ),
                }
              : {}),
          });
          return false;
        }
        saveBlob(result.blob, result.filename);
        toast({
          title: ar ? "تم التنزيل" : "Downloaded",
          description: result.filename,
        });
        return true;
      } finally {
        setBusyFormat(null);
      }
    },
    [toast]
  );

  return { download, busyFormat, isBusy: busyFormat != null };
}
